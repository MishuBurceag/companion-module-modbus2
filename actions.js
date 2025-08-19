module.exports = function (self) {
	// Ensure main is properly referenced
	self.main = require('./main');

	self.setActionDefinitions({
		sample_action: {
			name: 'My First Action',
			options: [
				{
					id: 'num',
					type: 'number',
					label: 'Test',
					default: 5,
					min: 0,
					max: 100,
				},
			],
			callback: async (event) => {
				console.log('Hello world!', event.options.num)
			},
		},
		toggle_coil: {
			name: 'Toggle Coil',
			options: [
				{
					type: 'number',
					label: 'Coil Index',
					id: 'coil',
					default: 0,
					min: 0,
					max: self.numCoils - 1,
				},
			],
			callback: (action) => {
				self.debugLog('info', `inActions.js: Toggling coil ${action.options.coil}`);
				self.toggleCoil(action.options.coil);
			},
		},
		set_coil: {
			name: 'Set Coil State',
			options: [
				{
					type: 'number',
					label: 'Coil Index',
					id: 'coil',
					default: 0,
					min: 0,
					max: self.numCoils - 1,
				},
				{
					type: 'dropdown',
					label: 'State',
					id: 'state',
					choices: [
						{ id: 1, label: 'On' },
						{ id: 0, label: 'Off' },
					],
					default: 1,
				},
			],
			callback: (action) => {
				const value = action.options.state === 1;
				self.setCoil(action.options.coil, value);
			},
		},
		get_coil: {
			name: 'Get Coil State',
			callback: () => {
				self.monitorCoils();
			},
		},
		toggle_server_connection: {
			name: 'Toggle Server Connection',
			options: [
				{
					type: 'dropdown',
					label: 'State',
					id: 'state',
					choices: [
						{ id: 1, label: 'On' },
						{ id: 0, label: 'Off' },
					],
					default: 1,
				},
			],
			callback: (action) => {
				const state = action.options.state === 1 ? 'connected' : 'disconnected';
				self.debugLog('info', `Server connection ${state}. Clients connected: ${self.clients.length}`);
				self.debugLog('info', `TCP connections: ${self.tcpConnections.length}`);
			},
		},
		reset_level_states: {
			name: 'Reset Level States',
			callback: () => {
				self.debugLog('info', 'Resetting all level states');
				self.resetLevelStates();
			},
		},
		setCoilState: {
			name: 'Set Coil State',
			options: [
				{
					type: 'number',
					label: 'Coil Number',
					id: 'coil',
					default: 0,
					min: 0,
					max: self.numCoils - 1,
				},
				{
					type: 'checkbox',
					label: 'State',
					id: 'state',
					default: true,
				}
			],
			callback: async (action) => {
				const coilNum = parseInt(action.options.coil);
				const state = action.options.state;
				
				// Set the coil state
				self.setCoil(coilNum, state);
				
				// Update variables
				const updates = {
					[`coil_${coilNum}`]: state ? 'true' : 'false'
				};
				
				// Update level state only when turning on
				if (state) {
					updates[`coil_level_${coilNum}`] = 'true';
				}
				
				self.setVariableValues(updates);
			},
		},
		// New action to explicitly set variables
		setVariables: {
			name: 'Set Variables',
			options: [
				{
					type: 'number',
					label: 'Coil Number',
					id: 'coil',
					default: 0,
					min: 0,
					max: self.numCoils - 1,
				},
				{
					type: 'dropdown',
					label: 'Variable Type',
					id: 'varType',
					choices: [
						{ id: 'level', label: 'Level' },
						{ id: 'coil', label: 'Coil' }
					],
					default: 'level'
				},
				{
					type: 'checkbox',
					label: 'State',
					id: 'state',
					default: true
				}
			],
			callback: async (action) => {
				const coilNum = parseInt(action.options.coil);
				const state = action.options.state;
				const varType = action.options.varType;
				
				const updates = {};
				updates[`coil_${varType}_${coilNum}`] = state ? 'true' : 'false';
				
				self.setVariableValues(updates);
			},
		},
	});
}
