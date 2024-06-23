'use client'
import { Avatar } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'
import ChatPageContext from '@/app/chat/components/context'
import { useRouter } from 'next/navigation'
import { useContext, useState } from 'react'
import { useSWRJson } from '@/hooks/swr'
import { WithLoadingAndError } from '@/components/ui'
import { useUserProfile } from '@/components/providers/userProfileContext'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { SearchBarWithButtonsOnRight } from '@/components/app/SearchBarWithButtons'
import * as dto from '@/types/dto'

const EMPTY_ASSISTANT_NAME = ''

const isWorkspaceVisible = (profile: dto.UserProfile, workspaceId: string) => {
  return profile.workspaces?.find((w) => w.id == workspaceId)
}

const SelectAssistantPage = () => {
  const { dispatch } = useContext(ChatPageContext)
  const { t } = useTranslation('common')
  const router = useRouter()
  const profile = useUserProfile()
  const [searchTerm, setSearchTerm] = useState<string>('')

  const {
    data: assistants,
    isLoading,
    error,
  } = useSWRJson<dto.UserAssistant[]>(`/api/user/assistants/explore`)

  const isAssistantAvailable = (assistant: dto.UserAssistant) => {
    if (assistant.name == EMPTY_ASSISTANT_NAME) return false
    if (assistant.owner == profile?.id) return true
    for (const sharing of assistant.sharing) {
      if (sharing.type == 'all') return true
      if (
        sharing.type == 'workspace' &&
        profile &&
        isWorkspaceVisible(profile, sharing.workspaceId)
      )
        return true
    }
    return false
  }

  const searchTermLowerCase = searchTerm.toLocaleLowerCase()
  const filterWithSearch = (assistant: dto.UserAssistant) => {
    return (
      searchTerm.trim().length == 0 ||
      assistant.name.toLocaleLowerCase().includes(searchTermLowerCase) ||
      assistant.description.toLocaleLowerCase().includes(searchTermLowerCase)
    )
  }

  // just simulate a lot of assistants
  //for(let a = 0; a < 5; a++) { assistants = [...assistants, ...assistants] }
  const handleSelect = (assistant: dto.UserAssistant) => {
    if (!(assistant.name == EMPTY_ASSISTANT_NAME && assistant.owner == profile?.id)) {
      dispatch({ field: 'newChatAssistantId', value: assistant.id })
      router.push('/chat')
    }
  }

  const gotoMyAssistants = () => {
    router.push('/chat/assistants/mine')
  }

  return (
    <WithLoadingAndError isLoading={isLoading} error={error}>
      <div className="flex flex-1 justify-center">
        <div className="flex flex-1 flex-col gap-2 max-w-[960px] w-3/4 px-4 py-6">
          <h1 className="text-center">{t('select_assistant')}</h1>
          <SearchBarWithButtonsOnRight searchTerm={searchTerm} onSearchTermChange={setSearchTerm}>
            <Button onClick={gotoMyAssistants}>My assistants</Button>
          </SearchBarWithButtonsOnRight>

          <ScrollArea className="flex-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 m-auto gap-3">
              {(assistants ?? [])
                .filter(isAssistantAvailable)
                .filter(filterWithSearch)
                .map((assistant) => {
                  return (
                    <button
                      key={assistant.id}
                      className="flex gap-3 py-2 px-4 border text-left w-full overflow-hidden h-18 group"
                      onClick={() => handleSelect(assistant)}
                    >
                      <Avatar
                        className="shrink-0 self-center"
                        size="big"
                        url={assistant.iconUri ?? undefined}
                        fallback={assistant.name}
                      />
                      <div className="flex flex-col flex-1 h-full">
                        <div className="font-bold">{assistant.name}</div>
                        <div className="opacity-50 overflow-hidden text-ellipsis line-clamp-2">
                          {assistant.description}
                        </div>
                      </div>
                    </button>
                  )
                })}
            </div>
          </ScrollArea>
        </div>
      </div>
    </WithLoadingAndError>
  )
}

const SelectAssistantPageWithToolbars = () => {
  return <SelectAssistantPage></SelectAssistantPage>
}

export default SelectAssistantPageWithToolbars
