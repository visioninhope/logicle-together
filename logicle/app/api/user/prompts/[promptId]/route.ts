import { getPrompt, deletePrompt, updatePrompt } from '@/models/prompt'
import ApiResponses from '@/api/utils/ApiResponses'
import * as dto from '@/types/dto'
import { requireSession } from '@/app/api/utils/auth'

export const dynamic = 'force-dynamic'

// Fetch prompt
export const GET = requireSession(async (session, req, route: { params: { promptId: string } }) => {
  const prompt = await getPrompt(route.params.promptId as string)
  if (!prompt) {
    return ApiResponses.noSuchEntity()
  }
  if (prompt.ownerId != session.user.id) {
    return ApiResponses.forbiddenAction("Can't access the prompt of another user")
  }
  return ApiResponses.json(prompt)
})

// Save prompt
export const PUT = requireSession(async (session, req, route: { params: { promptId: string } }) => {
  const prompt = (await req.json()) as dto.Prompt
  const dbPrompt = await getPrompt(route.params.promptId)
  if (dbPrompt && dbPrompt.ownerId != session.user.id) {
    return ApiResponses.forbiddenAction("Can't overwrite the prompt of another user")
  }
  if (route.params.promptId !== prompt.id) {
    return ApiResponses.error(
      400,
      'The data provided is not consistent with the path. Check the IDs'
    )
  }
  if (prompt.ownerId !== session.user.id) {
    return ApiResponses.conflict()
  }
  await updatePrompt(prompt.id, prompt)
  return ApiResponses.success()
})

// Delete prompt
export const DELETE = requireSession(
  async (session, req, route: { params: { promptId: string } }) => {
    const dbPrompt = await getPrompt(route.params.promptId)
    if (dbPrompt && dbPrompt.ownerId != session.user.id) {
      return ApiResponses.forbiddenAction("Can't overwrite the prompt of another user")
    }
    await deletePrompt(route.params.promptId)
    return ApiResponses.success()
  }
)
