import { ToolBuilder, ToolFunction, ToolImplementation } from '../../chat'
import { TimeOfDayInterface } from './interface'

export class TimeOfDay extends TimeOfDayInterface implements ToolImplementation {
  static builder: ToolBuilder = () => new TimeOfDay()
  functions: ToolFunction[] = [
    {
      name: 'timeOfDay',
      description: 'Retrieve the current time',
      parameters: {
        type: 'object',
        properties: {
          location: {
            type: 'string',
            description: 'The city and state, e.g. San Francisco, CA',
          },
        },
        required: ['location'],
      },
      invoke: async () => {
        return new Date().toLocaleString()
      },
    },
  ]
}
