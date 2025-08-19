module.exports = function (self) {
	const variableDefinitions = [
        {
            name: 'Modbus Connected Status',
            variableId: 'connected_status',
        },
    ];

    // Add pulse (original) coil variables
    for (let i = 0; i < self.numCoils; i++) {
        variableDefinitions.push({
            variableId: `coil_${i}`,
            name: `Coil ${i} Status (Pulse)`
        });
        // Add level coil variables
        variableDefinitions.push({
            variableId: `coil_level_${i}`,
            name: `Coil ${i} Status (Level)`
        });
    }

    // Log the variable definitions before setting them
    //self.log('info', `Setting variable definitions: ${JSON.stringify(variableDefinitions, null, 2)}`);

    self.setVariableDefinitions(variableDefinitions);

    // Log a message after setting the variable definitions
    self.debugLog('info', `Variable definitions set successfully`);

    // Set initial value for Modbus connected status
    self.setVariableValues({ connected_status: self.connected ? 'true' : 'false' });

    // Log the initial value for Modbus connected status
    self.debugLog('info', `Initial Modbus connected status: ${self.connected ? 'true' : 'false'}`);

    // Set initial values for coil and level statuses
    const initialValues = {};
    for (let i = 0; i < self.numCoils; i++) {
        initialValues[`coil_${i}`] = 'false';
        initialValues[`coil_level_${i}`] = self.levelStates[i] ? 'true' : 'false';
    }
    self.setVariableValues(initialValues);
}
