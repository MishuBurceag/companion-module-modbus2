const { combineRgb } = require('@companion-module/base')

module.exports = async function (self) {
    self.setFeedbackDefinitions({
        ConnectionStatus: {
            name: 'Connection Status',
            type: 'boolean',
            label: 'Server Connection State',
            defaultStyle: {
                bgcolor: combineRgb(255, 0, 0),
                color: combineRgb(255, 255, 255),
            },
            options: [],
            callback: (feedback) => {
                return self.connected === true
            },
        },
        ChannelState: {
            name: 'Example Feedback',
            type: 'boolean',
            label: 'Channel State',
            defaultStyle: {
                bgcolor: combineRgb(255, 0, 0),
                color: combineRgb(0, 0, 0),
            },
            options: [
                {
                    id: 'num',
                    type: 'number',
                    label: 'Test',
                    default: 5,
                    min: 0,
                    max: 10,
                },
            ],
            callback: (feedback) => {
                const coilState = self.coils[0] === 1;
               // self.log('info', `Feedback for Coil 0: ${coilState}`);
                return coilState;
                },
            },
        
    })
}