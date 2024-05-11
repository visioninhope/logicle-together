'use client'
import { WithLoadingAndError } from '@/components/ui'
import { useParams, useRouter } from 'next/navigation'
import React, { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'next-i18next'
import { AssistantForm } from '../components/AssistantForm'
import * as dto from '@/types/dto'
import { get, patch, post } from '@/lib/fetch'
import { AssistantPreview } from '../components/AssistantPreview'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/types/base'
import { useConfirmationContext } from '@/components/providers/confirmationContext'
import { IconArrowLeft } from '@tabler/icons-react'
import { SelectSharingDialog } from '../components/SelectSharingDialog'

interface State {
  assistant?: dto.SelectableAssistantWithTools
  isLoading: boolean
  error?: ApiError
}

const AssistantPage = () => {
  const { id } = useParams() as { id: string }
  const { t } = useTranslation('common')
  const assistantUrl = `/api/assistants/${id}`
  const fireSubmit = useRef<(() => void) | undefined>(undefined)
  const confirmationContext = useConfirmationContext()
  const [state, setState] = useState<State>({
    isLoading: false,
  })
  const [selectSharingVisible, setSelectSharingVisible] = useState<boolean>(false)
  const { assistant, isLoading, error } = state
  const sharing = assistant?.sharing || []
  const router = useRouter()

  useEffect(() => {
    const doLoad = async () => {
      const stored = localStorage.getItem(id)
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as dto.SelectableAssistantWithTools
          if (
            await confirmationContext.askConfirmation({
              title: 'Found an unsaved version',
              message: 'Do you want to recover an unsaved version?',
              confirmMsg: 'Recover',
            })
          ) {
            setState({
              ...state,
              isLoading: false,
              assistant: parsed,
            })
          } else {
            localStorage.removeItem(id)
          }
        } catch {
          console.log('Failed recovering assistant from local storage')
        }
      }
      const response = await get<dto.SelectableAssistantWithTools>(assistantUrl)
      if (response.error) {
        setState({
          ...state,
          isLoading: false,
          error: response.error,
        })
      } else {
        setState({
          ...state,
          isLoading: false,
          assistant: response.data,
        })
      }
    }
    if (state.assistant === undefined && !state.isLoading) {
      setState({
        ...state,
        isLoading: true,
      })
      doLoad()
    }
  }, [assistantUrl, confirmationContext, id, state])

  if (!assistant) {
    return (
      <WithLoadingAndError isLoading={isLoading} error={error}>
        <></>
      </WithLoadingAndError>
    )
  }

  async function onChange(values: Partial<dto.InsertableAssistant>) {
    setState({
      ...state,
      assistant: { ...assistant!, ...values },
    })
    localStorage.setItem(assistant!.id, JSON.stringify(assistant))
  }

  async function onSubmit(values: Partial<dto.InsertableAssistant>) {
    onChange(values)
    const response = await patch(assistantUrl, {
      ...assistant,
      ...values,
      sharing: undefined,
    })
    if (response.error) {
      toast.error(response.error.message)
      return
    }
    localStorage.removeItem(assistant!.id)
    toast.success(t('assistant-successfully-updated'))
  }

  const setSharing = async (sharing: dto.Sharing[]) => {
    setState({
      ...state,
      assistant: {
        ...assistant!,
        sharing: sharing,
      },
    })
  }

  const dumpSharing = (sharing: dto.Sharing[]) => {
    if (sharing.length == 0) {
      return 'none'
    } else {
      return sharing
        .map((sharing) => {
          if (sharing.type == 'workspace') {
            return sharing.workspaceName
          } else {
            return sharing.type
          }
        })
        .join('/')
    }
  }
  return (
    <div className="flex flex-col h-full overflow-hidden pl-4 pr-4">
      <div className="flex justify-between items-center">
        <div className="flex justify-center items-center">
          <button onClick={router.back}>
            <IconArrowLeft></IconArrowLeft>
          </button>
          <h1>{`Assistant ${assistant.name}`}</h1>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="px-2" onClick={() => setSelectSharingVisible(true)}>
            {`Shared with ${dumpSharing(assistant.sharing)}`}
          </Button>
          <Button onClick={() => fireSubmit.current?.()}>Submit</Button>
        </div>
      </div>
      <div className={`flex-1 min-h-0 grid grid-cols-2 overflow-hidden`}>
        <AssistantForm
          assistant={assistant}
          onSubmit={onSubmit}
          onChange={onChange}
          fireSubmit={fireSubmit}
        />
        <AssistantPreview
          assistant={assistant}
          className="pl-4 h-full flex-1 min-w-0"
        ></AssistantPreview>
      </div>
      {selectSharingVisible && (
        <SelectSharingDialog
          onClose={() => {
            setSelectSharingVisible(false)
          }}
          assistantUrl={assistantUrl}
          initialStatus={sharing}
          onSharingChange={setSharing}
        ></SelectSharingDialog>
      )}
    </div>
  )
}

export default AssistantPage
