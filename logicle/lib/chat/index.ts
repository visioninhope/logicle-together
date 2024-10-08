import { ProviderType } from '@/types/provider'
import * as dto from '@/types/dto'
import { FunctionDefinition } from 'openai/resources/shared'
import { nanoid } from 'nanoid'
import env from '@/lib/env'
import * as ai from 'ai'
import * as openai from '@ai-sdk/openai'
import * as anthropic from '@ai-sdk/anthropic'
import * as vertex from '@ai-sdk/google-vertex'
import { JWTInput } from 'google-auth-library'

export interface ToolFunction extends FunctionDefinition {
  invoke: (
    messages: dto.Message[],
    assistantId: string,
    params: Record<string, any>
  ) => Promise<string>
  requireConfirm?: boolean
}

export interface ToolImplementationUploadParams {
  fileId: string
  fileName: string
  contentType: string
  contentStream: ReadableStream
  assistantId?: string
}

export interface ToolImplementationUploadResult {
  externalId: string
}

export interface ToolImplementation {
  functions: ToolFunction[]
  processFile?: (params: ToolImplementationUploadParams) => Promise<ToolImplementationUploadResult>
  deleteDocuments?: (docIds: string[]) => Promise<void>
}

export type ToolBuilder = (
  params: Record<string, any>
) => Promise<ToolImplementation> | ToolImplementation

interface ProviderParams {
  apiKey?: string
  baseUrl?: string
  providerType: ProviderType
}

interface AssistantParams {
  model: string
  assistantId: string
  systemPrompt: string
  temperature: number
}

export interface LLMStreamParams {
  llmMessages: ai.CoreMessage[]
  dbMessages: dto.Message[]
  userId?: string
  conversationId: string
  userMsgId: string
  onSummarize?: (response: dto.Message) => Promise<string>
  onComplete?: (response: dto.Message) => Promise<void>
}

export class ChatAssistant {
  llProviderType: ProviderType
  assistantParams: AssistantParams
  providerParams: ProviderParams
  functions: ToolFunction[]
  languageModel: ai.LanguageModel
  saveMessage?: (message: dto.Message) => Promise<void>
  constructor(
    providerParams: ProviderParams,
    assistantParams: AssistantParams,
    functions: ToolFunction[],
    saveMessage?: (message: dto.Message) => Promise<void>
  ) {
    this.providerParams = providerParams
    this.llProviderType = providerParams.providerType
    this.assistantParams = assistantParams
    this.functions = functions
    this.saveMessage = saveMessage
    const provider = ChatAssistant.createProvider(
      this.llProviderType,
      this.providerParams.apiKey ?? ''
    )
    this.languageModel = provider.languageModel(this.assistantParams.model, {})
  }

  static createProvider(providerType: ProviderType, apiKey: string) {
    switch (providerType) {
      case 'openai':
        return openai.createOpenAI({
          compatibility: 'strict', // strict mode, enable when using the OpenAI API
          apiKey: apiKey,
        })
      case 'anthropic':
        return anthropic.createAnthropic({
          apiKey: apiKey,
        })
      case 'gcp-vertex': {
        const credentials = JSON.parse(apiKey) as JWTInput
        return vertex.createVertex({
          location: 'us-central1',
          project: credentials.project_id,
          googleAuthOptions: {
            credentials: credentials,
          },
        })
      }
      default:
        return openai.createOpenAI({
          compatibility: 'strict', // strict mode, enable when using the OpenAI API
          apiKey: apiKey,
        })
    }
  }
  createTools() {
    if (this.functions.length == 0) return undefined
    return Object.fromEntries(
      this.functions.map((f) => {
        return [
          f.name,
          {
            description: f.description,
            parameters: ai.jsonSchema(f.parameters!),
          },
        ]
      })
    )
  }
  async sendUserMessage({
    conversationId,
    userMsgId,
    llmMessages,
    dbMessages,
    userId,
    onSummarize,
    onComplete,
  }: LLMStreamParams): Promise<ReadableStream<string>> {
    //console.debug(`Sending messages: \n${JSON.stringify(llmMessages)}`)

    const result = ai.streamText({
      model: this.languageModel,
      messages: [
        {
          role: 'system',
          content: this.assistantParams.systemPrompt,
        },
        ...llmMessages,
      ],
      tools: this.createTools(),
      toolChoice: this.functions.length == 0 ? undefined : 'auto',
      temperature: this.assistantParams.temperature,
    })

    return await this.ProcessLLMResponse(
      {
        conversationId,
        userMsgId,
        llmMessages,
        dbMessages,
        userId,
        onSummarize,
        onComplete,
      },
      result
    )
  }

  async ProcessLLMResponse(
    {
      conversationId,
      userMsgId,
      llmMessages,
      dbMessages,
      userId,
      onSummarize,
      onComplete,
    }: LLMStreamParams,
    streamPromise: Promise<ai.StreamTextResult<any>>
  ): Promise<ReadableStream<string>> {
    const assistantResponse: dto.Message = {
      id: nanoid(),
      role: 'assistant',
      content: '',
      attachments: [],
      conversationId: conversationId,
      parent: userMsgId,
      sentAt: new Date().toISOString(),
    }
    const startController = async (controller: ReadableStreamDefaultController<string>) => {
      try {
        const msg: dto.TextStreamPart = {
          type: 'response',
          content: assistantResponse,
        }
        controller.enqueue(`data: ${JSON.stringify(msg)} \n\n`)
        let completed = false
        let stream = await streamPromise
        while (!completed) {
          let toolName = ''
          let toolArgs: any = undefined
          let toolArgsText = ''
          let toolCallId = ''
          for await (const chunk of stream.fullStream) {
            //console.log(`Received chunk from LLM ${JSON.stringify(chunk)}`)
            if (chunk.type == 'tool-call') {
              toolName = chunk.toolName
              toolArgs = chunk.args
              toolCallId = chunk.toolCallId
            } else if (chunk.type == 'tool-call-delta') {
              toolName += chunk.toolName
              toolArgsText += chunk.argsTextDelta
              toolCallId += chunk.toolCallId
            } else if (chunk.type == 'text-delta') {
              const delta = chunk.textDelta
              const msg: dto.TextStreamPart = {
                type: 'delta',
                content: delta,
              }
              // Append the message after sending it to the client.
              // While it is not possible to keep what we store in db consistent
              // with what the client sees... it is fairly reasonable to assume
              // that if we fail to send it, the user has not seen it (But I'm not
              // sure that this is obvious)
              assistantResponse.content = assistantResponse.content + delta
              controller.enqueue(`data: ${JSON.stringify(msg)} \n\n`)
            } else if (chunk.type == 'finish') {
              console.debug(`Usage: ${JSON.stringify(chunk.usage)}`)
            }
          }
          // If there's a tool invocation, we execute it, make a new
          // completion request appending assistant tool invocation and our response,
          // and restart as if "nothing had happened".
          // While it is not super clear, we believe that the context should not include
          // function calls
          if (toolName.length != 0) {
            const functionDef = this.functions.find((f) => f.name === toolName)
            if (!functionDef) {
              throw new Error(`No such function: ${functionDef}`)
            }
            toolArgs = toolArgs ?? JSON.parse(toolArgsText)
            const toolCall: dto.ConfirmRequest = {
              toolName,
              toolArgs: toolArgs,
              toolCallId: toolCallId,
            }
            if (functionDef.requireConfirm) {
              completed = true
              const msg: dto.TextStreamPart = {
                type: 'confirmRequest',
                content: toolCall,
              }
              assistantResponse.confirmRequest = toolCall
              controller.enqueue(`data: ${JSON.stringify(msg)} \n\n`)
            } else {
              console.log(`Invoking tool "${toolName}" with args ${JSON.stringify(toolArgs)}`)
              const funcResult = await functionDef.invoke(
                dbMessages,
                this.assistantParams.assistantId,
                toolArgs
              )
              console.log(`Result is... ${funcResult}`)
              stream = await this.sendToolResult(toolCall, funcResult, llmMessages, userId)
            }
          } else {
            completed = true
          }
        }
        if (onSummarize) {
          try {
            const summaryMsg: dto.TextStreamPart = {
              type: 'summary',
              content: await onSummarize(assistantResponse),
            }
            try {
              controller.enqueue(`data: ${JSON.stringify(summaryMsg)} \n\n`)
            } catch (e) {
              console.log(`Failed sending summary: ${e}`)
            }
          } catch (e) {
            console.log(`Failed generating summary: ${e}`)
          }
        }
        controller.close()
      } catch (error) {
        try {
          controller.enqueue('Internal error')
        } catch (e) {
          // swallowed exception. The stream might be closed
        }
        controller.error(error)
      }
      await this.saveMessage?.(assistantResponse)
      await onComplete?.(assistantResponse)
    }
    return new ReadableStream<string>({ start: startController })
  }

  async sendConfirmResponse(
    llmMessagesToSend: ai.CoreMessage[],
    dbMessages: dto.Message[],
    userMessage: dto.Message,
    confirmRequest: dto.ConfirmRequest,
    userId?: string
  ) {
    const functionDef = this.functions.find((f) => f.name === confirmRequest.toolName)
    let funcResult: string
    if (!functionDef) {
      funcResult = `No such function: ${functionDef}`
    } else if (!userMessage.confirmResponse!.allow) {
      funcResult = `User denied access to function`
    } else {
      funcResult = await functionDef.invoke(
        dbMessages,
        this.assistantParams.assistantId,
        confirmRequest.toolArgs
      )
    }
    const streamPromise = this.sendToolResult(confirmRequest, funcResult, llmMessagesToSend, userId)
    return this.ProcessLLMResponse(
      {
        llmMessages: llmMessagesToSend,
        dbMessages: dbMessages,
        userId: userId,
        conversationId: userMessage.conversationId,
        userMsgId: userMessage.id,
      },
      streamPromise
    )
  }
  async sendToolResult(
    toolCall: dto.ConfirmRequest,
    funcResult: string,
    messages: ai.CoreMessage[],
    userId?: string
  ): Promise<ai.StreamTextResult<any>> {
    if (this.llProviderType != ProviderType.LogicleCloud) {
      userId = undefined
    }
    const llmMessages: ai.CoreMessage[] = [
      {
        role: 'system',
        content: this.assistantParams.systemPrompt,
      },
      ...messages,
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: toolCall.toolCallId,
            toolName: toolCall.toolName,
            args: toolCall.toolArgs,
          },
        ],
      },
      {
        role: 'tool',
        content: [
          {
            toolCallId: toolCall.toolCallId,
            type: 'tool-result',
            toolName: toolCall.toolName,
            result: funcResult,
          },
        ],
      },
    ]
    //console.debug(`Sending messages: \n${JSON.stringify(llmMessages)}`)
    const result = ai.streamText({
      model: this.languageModel,
      messages: llmMessages,
      tools: this.createTools(),
      toolChoice: this.functions.length == 0 ? undefined : 'auto',
      temperature: this.assistantParams.temperature,
    })
    return result
  }
  summarize = async (conversation: any, userMsg: dto.Message, assistantMsg: dto.Message) => {
    const messages: ai.CoreMessage[] = [
      {
        role: 'user',
        content:
          userMsg.content.substring(0, env.chat.autoSummaryMaxLength) +
          `\nUploaded ${userMsg.attachments.length} + files`,
      },
      {
        role: 'assistant',
        content: assistantMsg.content.substring(0, env.chat.autoSummaryMaxLength),
      },
      {
        role: 'user' as dto.MessageType,
        content: 'Summary of this conversation in three words, same language, usable as a title',
      },
    ]

    const result = await ai.streamText({
      model: this.languageModel,
      messages: messages,
      tools: undefined,
      temperature: this.assistantParams.temperature,
    })
    let summary = ''
    for await (const chunk of result.textStream) {
      summary += chunk
    }
    return summary
  }
}
