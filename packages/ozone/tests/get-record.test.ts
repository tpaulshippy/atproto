import {
  SeedClient,
  TestNetwork,
  basicSeed,
  TestOzone,
  ModeratorClient,
} from '@atproto/dev-env'
import { AtpAgent } from '@atproto/api'
import { AtUri } from '@atproto/syntax'
import {
  REASONOTHER,
  REASONSPAM,
} from '../src/lexicon/types/com/atproto/moderation/defs'
import { forSnapshot } from './_util'
import { ids } from '../src/lexicon/lexicons'

describe('admin get record view', () => {
  let network: TestNetwork
  let ozone: TestOzone
  let agent: AtpAgent
  let sc: SeedClient
  let modClient: ModeratorClient

  beforeAll(async () => {
    network = await TestNetwork.create({
      dbPostgresSchema: 'ozone_admin_get_record',
    })
    ozone = network.ozone
    agent = ozone.getClient()
    sc = network.getSeedClient()
    modClient = ozone.getModClient()
    await basicSeed(sc)
    await network.processAll()
  })

  afterAll(async () => {
    await network.close()
  })

  beforeAll(async () => {
    await sc.createReport({
      reportedBy: sc.dids.bob,
      reasonType: REASONSPAM,
      subject: {
        $type: 'com.atproto.repo.strongRef',
        uri: sc.posts[sc.dids.alice][0].ref.uriStr,
        cid: sc.posts[sc.dids.alice][0].ref.cidStr,
      },
    })
    await sc.createReport({
      reportedBy: sc.dids.carol,
      reasonType: REASONOTHER,
      reason: 'defamation',
      subject: {
        $type: 'com.atproto.repo.strongRef',
        uri: sc.posts[sc.dids.alice][0].ref.uriStr,
        cid: sc.posts[sc.dids.alice][0].ref.cidStr,
      },
    })
    await modClient.emitEvent({
      event: { $type: 'tools.ozone.moderation.defs#modEventTakedown' },
      subject: {
        $type: 'com.atproto.repo.strongRef',
        uri: sc.posts[sc.dids.alice][0].ref.uriStr,
        cid: sc.posts[sc.dids.alice][0].ref.cidStr,
      },
    })
    await network.bsky.ctx.dataplane.takedownRecord({
      recordUri: sc.posts[sc.dids.alice][0].ref.uriStr,
    })
  })

  it('gets a record by uri, even when taken down.', async () => {
    const result = await agent.api.tools.ozone.moderation.getRecord(
      { uri: sc.posts[sc.dids.alice][0].ref.uriStr },
      { headers: await ozone.modHeaders(ids.ToolsOzoneModerationGetRecord) },
    )
    expect(forSnapshot(result.data)).toMatchSnapshot()
  })

  it('gets a record by uri and cid.', async () => {
    const result = await agent.api.tools.ozone.moderation.getRecord(
      {
        uri: sc.posts[sc.dids.alice][0].ref.uriStr,
        cid: sc.posts[sc.dids.alice][0].ref.cidStr,
      },
      { headers: await ozone.modHeaders(ids.ToolsOzoneModerationGetRecord) },
    )
    expect(forSnapshot(result.data)).toMatchSnapshot()
  })

  it('fails when record does not exist.', async () => {
    const promise = agent.api.tools.ozone.moderation.getRecord(
      {
        uri: AtUri.make(
          sc.dids.alice,
          'app.bsky.feed.post',
          'badrkey',
        ).toString(),
      },
      { headers: await ozone.modHeaders(ids.ToolsOzoneModerationGetRecord) },
    )
    await expect(promise).rejects.toThrow('Record not found')
  })

  it('fails when record cid does not exist.', async () => {
    const promise = agent.api.tools.ozone.moderation.getRecord(
      {
        uri: sc.posts[sc.dids.alice][0].ref.uriStr,
        cid: sc.posts[sc.dids.alice][1].ref.cidStr, // Mismatching cid
      },
      { headers: await ozone.modHeaders(ids.ToolsOzoneModerationGetRecord) },
    )
    await expect(promise).rejects.toThrow('Record not found')
  })
})
