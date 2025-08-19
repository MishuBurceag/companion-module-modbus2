const net = require("net");
const jsModbus = require("jsmodbus");

// Create a TCP server
const server = new net.Server();

// Create Modbus server instance
const modbusServer = new jsModbus.server.TCP(server, {
    holding: Buffer.alloc(100 * 2, 0),  // 100 holding registers (each 2 bytes, initialized to 0)
    input: Buffer.alloc(100 * 2, 0),    // 100 input registers (each 2 bytes, initialized to 0)
    coils: Buffer.alloc(100, 0),        // 100 coils (each 1 bit, initialized to 0)
    discrete: Buffer.alloc(100, 0),     // 100 discrete inputs (each 1 bit, initialized to 0)
});

server.listen(502, "0.0.0.0", () => {
    console.log("✅ Modbus TCP Server Running on Port 502");
});

server.on("connection", (client) => {
    console.log("🔌 Client Connected:", client.remoteAddress);
});

// Handle Read Coils Request
modbusServer.on("readCoils", (request, response) => {
    const { address, quantity } = request;
    console.log(`📥 Read Coils: Addr=${address}, Length=${quantity}`);

    if (address < 0 || address + quantity > 100) {
        console.error("❌ Illegal Data Address for Coils");
        response.exceptionCode = 0x02;
        response.respond();
    } else {
        const coilsData = modbusServer.coils.slice(address, address + quantity);
        response.respond(coilsData);
    }
});

// Handle Read Discrete Inputs Request
modbusServer.on("readDiscreteInputs", (request, response) => {
    const { address, quantity } = request;
    console.log(`📥 Read Discrete Inputs: Addr=${address}, Length=${quantity}`);

    if (address < 0 || address + quantity > 100) {
        console.error("❌ Illegal Data Address for Discrete Inputs");
        response.exceptionCode = 0x02;
        response.respond();
    } else {
        const discreteData = modbusServer.discrete.slice(address, address + quantity);
        response.respond(discreteData);
    }
});

// Handle Write Single Coil Request
modbusServer.on("writeSingleCoil", (request, response) => {
    const { address, value } = request;
    console.log(`📥 Write Single Coil: Addr=${address}, Value=${value}`);

    if (address < 0 || address > 99) {
        console.error("❌ Illegal Data Address for Coil Write");
        response.exceptionCode = 0x02;
        response.respond();
    } else {
        modbusServer.coils[address] = value ? 0x01 : 0x00;
        response.respond();
    }
});

// Handle Write Multiple Coils Request
modbusServer.on("writeMultipleCoils", (request, response) => {
    const { address, quantity, values } = request;
    console.log(`📥 Write Multiple Coils: ${request} ---  Addr=${address}, Quantity=${quantity}`);

    if (address < 0 || address + quantity > 100) {
        console.error("❌ Illegal Data Address for Multiple Coil Write");
        response.exceptionCode = 0x02;
        response.respond();
    } else {
        for (let i = 0; i < quantity; i++) {
            modbusServer.coils[address + i] = values[i] ? 0x01 : 0x00;
        }
        //response.respond();
    }
});

// Handle Read Holding Registers
modbusServer.on("readHoldingRegisters", (request, response) => {
    const { address, quantity } = request;
    console.log(`📥 Read Holding Registers: Addr=${address}, Length=${quantity}`);

    if (address < 0 || address + quantity > 100) {
        console.error("❌ Illegal Data Address for Holding Registers");
        response.exceptionCode = 0x02;
        response.respond();
    } else {
        const data = modbusServer.holding.slice(address * 2, (address + quantity) * 2);
        response.respond(data);
    }
});

// Handle Write Holding Registers
modbusServer.on("writeHoldingRegisters", (request, response) => {
    const { address, quantity, values } = request;
    console.log(`📥 Write Holding Registers: Addr=${address}, Quantity=${quantity}`);

    if (address < 0 || address + quantity > 100) {
        console.error("❌ Illegal Data Address for Holding Registers");
        response.exceptionCode = 0x02;
        response.respond();
    } else {
        for (let i = 0; i < quantity; i++) {
            modbusServer.holding.writeUInt16BE(values[i], address * 2 + i * 2);
        }
        response.respond();
    }
});
