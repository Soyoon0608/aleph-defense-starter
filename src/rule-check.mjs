import { decide } from './decider.mjs';
import { detect } from './detect.mjs';

const NOTE_ID = '00000000-0000-4000-8000-000000000001';

const baseRequest = () => ({
  requestId: '00000000-0000-4000-8000-000000000010',
  classId: 'fixture-class',
  projectId: 'fixture-project',
  subjectId: 'fixture-subject',
  deviceId: 'aaaaaaaaaaaaaaaa',
  deviceRegistered: true,
  stepUp: {
    verified: false,
    authAgeSeconds: 0
  },
  service: 'notes',
  method: 'GET',
  path: `/api/notes/${NOTE_ID}`,
  route: 'GET /api/notes/:id',
  queryLength: 0,
  signals: {
    source: 'judge_fixture',
    region: 'local',
    network: 'usual',
    hour: 14
  },
  recentEvents: []
});

async function decisionCase(
  request,
  expectedDecision,
  expectedReason
) {
  const result = await decide(request);

  return {
    ready:
      result.decision === expectedDecision
      && result.reasonCode === expectedReason,
    decision: result.decision,
    reasonCode: result.reasonCode
  };
}

function detectionCase() {
  const start = Date.UTC(2026, 9, 14, 0, 0, 0);

  const events = Array.from(
    { length: 121 },
    (_, index) => ({
      at:
        new Date(start + index * 2000)
          .toISOString(),
      method: 'GET',
      identity: {
        sub: 'fixture-subject'
      },
      deviceId: 'bbbbbbbbbbbbbbbb',
      decision: 'allow',
      signals: {
        network: 'unusual'
      }
    })
  );

  const result = detect(events);

  return {
    ready:
      result.action === 'propose_revocation'
      && result.reasonCode === 'burst_read',
    action: result.action,
    reasonCode:
      result.reasonCode ?? null
  };
}

export async function runRuleCheck(caseId) {
  if (caseId === 'registered_device_note_allowed') {
    return {
      caseId,
      ...(await decisionCase(
        baseRequest(),
        'allow',
        'approved'
      ))
    };
  }

  if (caseId === 'unregistered_device_denied') {
    return {
      caseId,
      ...(await decisionCase(
        {
          ...baseRequest(),
          deviceRegistered: false
        },
        'deny',
        'device_not_registered'
      ))
    };
  }

  if (caseId === 'unusual_access_step_up') {
    return {
      caseId,
      ...(await decisionCase(
        {
          ...baseRequest(),
          signals: {
            source: 'judge_fixture',
            region: 'local',
            network: 'unusual',
            hour: 2
          },
          recentEvents: [
            {
              kind: 'risk_signal',
              ageSeconds: 60,
              count: 25
            }
          ]
        },
        'step_up',
        'step_up_required'
      ))
    };
  }

  if (caseId === 'other_zone_route_denied') {
    return {
      caseId,
      ...(await decisionCase(
        {
          ...baseRequest(),
          service: 'materials',
          path: '/api/materials/lesson-1',
          route: 'GET /api/materials/:id'
        },
        'deny',
        'instructor_material_denied'
      ))
    };
  }

  if (caseId === 'burst_read_revocation') {
    return {
      caseId,
      ...detectionCase()
    };
  }

  return null;
}
