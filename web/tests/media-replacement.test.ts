import { beforeEach, describe, expect, it } from 'vitest'
import { makeActions } from '../src/lib/actions.js'
import { localDb } from '../src/lib/db.js'

const OWNER = '00000000-0000-7000-8000-000000000007'
const EXERCISE = '00000000-0000-7000-8000-000000000008'

beforeEach(async () => {
  await localDb.delete()
  await localDb.open()
})

describe('exercise image queue', () => {
  it('keeps only the newest offline image for an exercise', async () => {
    const actions = makeActions(OWNER)
    await actions.queueUpload(EXERCISE, new Blob(['first']), 'first.png')
    await actions.queueUpload(EXERCISE, new Blob(['second']), 'second.png')

    const queued = await localDb.uploads.toArray()
    expect(queued).toHaveLength(1)
    expect(queued[0]).toMatchObject({ exerciseId: EXERCISE, filename: 'second.png' })
  })

  it('does not remove a pending image from another exercise', async () => {
    const actions = makeActions(OWNER)
    await actions.queueUpload(EXERCISE, new Blob(['first']), 'first.png')
    await actions.queueUpload('00000000-0000-7000-8000-000000000009', new Blob(['other']), 'other.png')

    expect(await localDb.uploads.count()).toBe(2)
  })
})
