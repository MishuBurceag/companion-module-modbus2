const jsModbus = require('jsmodbus')
const net = require('net')
const { InstanceBase, Regex, runEntrypoint, InstanceStatus } = require('@companion-module/base')
const UpgradeScripts = require('./upgrades')
const UpdateActions = require('./actions')
const UpdateFeedbacks = require('./feedbacks')
const UpdateVariableDefinitions = require('./variables')

class ModuleInstance extends InstanceBase {
    constructor(internal) {
        super(internal)
        this.server = null;
        this.lastCoilStates = [];
        this.variables = {};
        this.numCoils = 48;
        this.numDiscreteInputs = 48;
        this.debug = false;
        this.serverIP = "0.0.0.0";
        this.serverPort = 502;
        this.reconnectTimer = null;
        this.isReconnecting = false;
        this.maxReconnectAttempts = 100;
        this.reconnectAttempts = 0;
        this.levelStates = []; // Add level states array
    }

    async init(config) {
        this.config = config
        this.numCoils = config.numCoils || 48;
        this.numDiscreteInputs = config.numDiscreteInputs || 48;
        this.lastCoilStates = Array(this.numCoils).fill(0);
        this.debug = config.debug || false;
        this.serverIP = config.serverIP || "0.0.0.0";
        this.serverPort = config.serverPort || 502;
        this.levelStates = Array(this.numCoils).fill(0);

        if (!this.server) {
            this.debugLog('info', `Modbus TCP Server loaded`);
            this.startModbusServer();
            this.updateStatus(InstanceStatus.Ok)
        } else {
            this.debugLog('info', `Modbus TCP Server already started`);
        }
        this.initActions()
        this.updateActions()
        this.updateFeedbacks()
        this.updateVariableDefinitions()
    }
    
    // When module gets deleted
    async destroy() {
        this.debugLog('debug', 'destroy')
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
        }
        if (this.server) {
            try {
                await new Promise((resolve) => {
                    this.server.close(() => {
                        this.debugLog('info', 'Modbus TCP Server stopped');
                        resolve();
                    });
                });
            } catch (err) {
                this.debugLog('error', `Error stopping server: ${err.message}`);
            }
        }
    }

    // Helper method for conditional logging
    debugLog(level, ...args) {
        if (this.debug || level === 'error') {
            this.log(level, ...args);
        }
    }

    async configUpdated(config) {
        this.debugLog('info', 'Config updated');
        this.config = config;
        this.debug = config.debug || false;
        this.numCoils = config.numCoils || 48;
        this.numDiscreteInputs = config.numDiscreteInputs || 48;
        this.serverPort = config.serverPort || 502;
        
        // Reinitialize coil states array if number of coils changed
        if (this.lastCoilStates.length !== this.numCoils) {
            this.lastCoilStates = Array(this.numCoils).fill(0);
        }

        // Update variable definitions with new coil count
        this.updateVariableDefinitions();
    }

    startModbusServer() {
        try {
            if (this.isReconnecting) {
                this.debugLog('warn', 'Server reconnection already in progress');
                return;
            }

            const server = new net.Server();
            const modbusServer = new jsModbus.server.TCP(server, {
                holding: Buffer.alloc(this.numCoils * 2, 0),
                input: Buffer.alloc(this.numCoils * 2, 0),
                coils: Buffer.alloc(this.numCoils, 0),
                discrete: Buffer.alloc(this.numCoils, 0),
            });

            // Error handling for server
            server.on('error', (error) => {
                this.handleServerError(error);
            });

            // Handle unexpected server closure
            server.on('close', () => {
                this.handleServerClose();
            });

            // Handle client connections with error catching
            server.on('connection', (client) => {
                try {
                    this.handleClientConnection(client, modbusServer);
                } catch (err) {
                    this.debugLog('error', `Client connection error: ${err.message}`);
                }
            });

            // Start server with error handling
            server.listen(this.serverPort, this.serverIP, () => {
                this.debugLog('info', `✅ Modbus TCP Server Running on ${this.serverIP}:${this.serverPort}`);
                this.reconnectAttempts = 0;
                this.isReconnecting = false;
                this.updateStatus(InstanceStatus.Ok);
                this.setVariableValues({ connected_status: 'true' });
            });

            this.server = server;
        } catch (err) {
            this.debugLog('error', `Failed to start server: ${err.message}`);
            this.scheduleReconnect();
        }
    }

    handleServerError(error) {
        this.debugLog('error', `Server error: ${error.message}`);
        this.updateStatus(InstanceStatus.ConnectionError);
        this.setVariableValues({ connected_status: 'false' });
        
        if (error.code === 'EADDRINUSE') {
            this.debugLog('error', `Port ${this.serverPort} is in use, waiting longer before retry`);
            this.scheduleReconnect(10000); // Wait 10 seconds for port in use
        } else {
            this.scheduleReconnect();
        }
    }

    handleServerClose() {
        if (!this.isReconnecting) {
            this.debugLog('warn', 'Server closed unexpectedly');
            this.updateStatus(InstanceStatus.ConnectionError);
            this.setVariableValues({ connected_status: 'false' });
            this.scheduleReconnect();
        }
    }

    scheduleReconnect(delay = 5000) {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            this.debugLog('error', 'Max reconnection attempts reached');
            this.updateStatus(InstanceStatus.ConnectionError);
            return;
        }

        if (!this.isReconnecting) {
            this.isReconnecting = true;
            this.reconnectAttempts++;
            
            if (this.reconnectTimer) {
                clearTimeout(this.reconnectTimer);
            }

            this.reconnectTimer = setTimeout(() => {
                this.debugLog('info', `Reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
                this.startModbusServer();
            }, delay);
        }
    }

    handleClientConnection(client, modbusServer) {
        this.debugLog('info', `🔌 Client Connected: ${client.remoteAddress}`);
        
        client.on('error', (err) => {
            this.debugLog('error', `Client error: ${err.message}`);
        });

        client.on('close', () => {
            this.debugLog('warn', `🔌 Client Disconnected: ${client.remoteAddress}`);
        });

        client.on('data', (data) => {
            try {
                this.handleModbusData(data, client, modbusServer);
            } catch (err) {
                this.debugLog('error', `Data handling error: ${err.message}`);
            }
        });
    }

    handleModbusData(data, client, modbusServer) {
        const functionCode = data.readUInt8(7);
        if (functionCode === 15) { // Write Multiple Coils
            const address = data.readUInt16BE(8);
            const bitCount = data.readUInt16BE(10);
            const byteCount = data.readUInt8(12);
            const coilData = data.slice(13, 13 + byteCount);

            //this.debugLog('info', `Write Multiple Coils Request: Address=${address}, BitCount=${bitCount}, ByteCount=${byteCount}, Data=${coilData.toString('hex')}`);

            // Handle incomplete data by padding with zeros if necessary
            const values = [];
            for (let i = 0; i < bitCount; i++) {
                const byteIndex = Math.floor(i / 8);
                const bitIndex = i % 8;
                const bitValue = (coilData[byteIndex] & (1 << bitIndex)) !== 0;
                values.push(bitValue);
            }

            if (values.length < bitCount) {
                this.debugLog('warn', `Incomplete data: expected ${bitCount} bits, received ${values.length} bits. Padding with zeros.`);
                while (values.length < bitCount) {
                    values.push(false);
                }
            }

            // Update companion coil variables and level states
            this.debugLog('warn', `values: ${values}`);
                        values.forEach((value, index) => {
                const coilIndex = address + index;
                this.updateVariable(coilIndex, value);
                if (value) {
                    this.debugLog('warn', `Setting coil ${coilIndex} to ${value}`);
                    // Update level state when coil is set to 1
                    this.levelStates[coilIndex] = 1;
                    this.setVariableValues({ [`coil_level_${coilIndex}`]: 'true' });
                }
                //modbusServer.coils.writeUInt8(value ? 1 : 0, coilIndex);
            });

            // Send a response
            const response = Buffer.alloc(12);
            data.copy(response, 0, 0, 6); // Copy MBAP header
            response.writeUInt8(15, 7); // Function code
            response.writeUInt16BE(address, 8); // Starting address
            response.writeUInt16BE(bitCount, 10); // Quantity of coils
            client.write(response);
        } else if (functionCode === 2) { // Read Discrete Inputs
            const address = data.readUInt16BE(8);
            const quantity = data.readUInt16BE(10);

            //this.debugLog('info', `Read Discrete Inputs Request: Address=${address}, Quantity=${quantity}`);

            // Read discrete inputs (for simplicity, we'll return all zeros)
            const discreteInputs = Buffer.alloc(Math.ceil(quantity / 8), 0);

            // Send a response
            const response = Buffer.alloc(9 + discreteInputs.length);
            data.copy(response, 0, 0, 6); // Copy MBAP header
            response.writeUInt8(2, 7); // Function code
            response.writeUInt8(discreteInputs.length, 8); // Byte count
            discreteInputs.copy(response, 9); // Discrete inputs data
            client.write(response);
        }
    }

    initActions() {}

    updateVariable(index, value) {
        const updates = {
            [`coil_${index}`]: value ? 'true' : 'false'
        };
        
        // Update level state - only set to true, never back to false
        if (value) {
            this.levelStates[index] = 1;
            updates[`coil_level_${index}`] = 'true';
        }
        
        this.setVariableValues(updates);
    }

    // Add method to reset level states
    resetLevelStates() {
        this.levelStates = Array(this.numCoils).fill(0);
        const resetValues = {};
        for (let i = 0; i < this.numCoils; i++) {
            resetValues[`coil_level_${i}`] = 'false';
        }
        this.setVariableValues(resetValues);
    }

    updateVariableValues(coilsData) {
        const values = {};
        for (let i = 0; i < this.numCoils; i++) {
            values[`coil_${i}`] = coilsData[i] ? 'true' : 'false';
            // Maintain level state - only update if coil is true
            if (coilsData[i]) {
                this.levelStates[i] = 1;
                values[`coil_level_${i}`] = 'true';
            }
        }
        this.setVariableValues(values);
    }

    getConfigFields() {
        return [
            {
                type: 'textinput',
                id: 'serverIP',
                label: 'Server IP (0.0.0.0 for all interfaces)',
                width: 6,
                regex: Regex.IP,
                default: '0.0.0.0',
            },
            {
                type: 'number',
                id: 'serverPort',
                label: 'Server Port',
                width: 6,
                default: 502,
                min: 1,
                max: 65535,
            },
            {
                type: 'number',
                id: 'numCoils',
                label: 'Number of Coils',
                width: 4,
                default: 48,
                min: 1,
                max: 1000,
            },
            {
                type: 'number',
                id: 'numDiscreteInputs',
                label: 'Number of Discrete Inputs',
                width: 4,
                default: 48,
                min: 1,
                max: 1000,
            },
            {
                type: 'checkbox',
                id: 'debug',
                label: 'Enable Debug Logging',
                width: 4,
                default: false,
            },
        ]
    }

    updateActions() {
        UpdateActions(this)
    }

    updateFeedbacks() {
        UpdateFeedbacks(this)
    }

    updateVariableDefinitions() {
        UpdateVariableDefinitions(this)
    }

    setActions(actions) {
        this.actions = actions;
    }

    async disconnectServer() {
        if (this.server) {
            this.server.close(() => {
                this.debugLog('info', 'Server disconnected');
                this.updateFeedbacks();
            });
        }
    }

    // Handle setting individual coils
    setCoil(coilNumber, value) {
        if (this.server && coilNumber >= 0 && coilNumber < this.numCoils) {
            try {
                // Update the coil state in the server's coils buffer
                this.server._server.coils.writeUInt8(value ? 1 : 0, coilNumber);
                
                // Update our tracking variables
                this.updateVariable(coilNumber, value);
                
                this.debugLog('info', `Set coil ${coilNumber} to ${value}`);
            } catch (err) {
                this.debugLog('error', `Failed to set coil ${coilNumber}: ${err.message}`);
            }
        } else {
            this.debugLog('warn', `Invalid coil number ${coilNumber} or server not running`);
        }
    }

    setCoilState(coilNumber, state) {
        // Convert dropdown value to boolean
        const value = state === 1;
        this.setCoil(coilNumber, value);
    }
}

runEntrypoint(ModuleInstance, UpgradeScripts)
