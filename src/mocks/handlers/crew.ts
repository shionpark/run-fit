import { http, HttpResponse } from 'msw';
import { requireAuth, type AuthMode } from '../core/auth';
import type { PathFn } from '../core/path';
import { crews, faker, sessions, users } from '../data';
import { parseIdParam, successResponse } from '../utils';

interface CreateCrewRequest {
  name: string;
  description: string;
  city: string;
  image?: string | null;
}

const findCrew = (id: unknown) => crews.find((c) => c.id === Number(id));

// 크루마다 같은 멤버가 나오도록 crew.id 기준으로 users에서 차례로 고른다.
const crewMembers = (crew: {
  id: number;
  memberCount: number;
  createdAt: string;
}) =>
  Array.from({ length: crew.memberCount }, (_, i) => {
    const user = users[(crew.id + i) % users.length];
    return {
      userId: user.id,
      name: user.name,
      profileImage: user.image ?? null,
      role: i === 0 ? 'LEADER' : i < 3 ? 'STAFF' : 'MEMBER',
      introduction: user.introduction ?? null,
      joinedAt: crew.createdAt,
    };
  });

export function createCrewHandlers(p: PathFn, authMode: AuthMode) {
  return [
    // 크루 생성
    http.post(
      p('/api/crews'),
      requireAuth(authMode, async ({ request }) => {
        const reqBody = (await request.json()) as CreateCrewRequest;
        const { name, description, city, image } = reqBody;

        const data = {
          id: 1,
          name: name,
          description: description,
          city: city,
          image: image ?? null,
          createdAt: new Date().toISOString(),
        };

        return HttpResponse.json(successResponse(data), { status: 201 });
      })
    ),

    // 크루 목록 조회
    http.get(p('/api/crews'), ({ request }) => {
      const url = new URL(request.url);

      const page = parseInt(url.searchParams.get('page') || '0', 10);
      const size = parseInt(url.searchParams.get('size') || '20', 10);
      const city = url.searchParams.get('city'); // 복수 선택 가능
      const keyword = url.searchParams.get('keyword') || '';
      const sort = url.searchParams.get('sort') || 'createdAtDesc'; // createdAtDesc, lastSessionDesc, memberCountDesc, nameAsc, nameDesc

      let filteredCrews = [...crews];

      if (city) {
        filteredCrews = filteredCrews.filter((c) => c.city === city);
      }

      if (keyword) {
        filteredCrews = filteredCrews.filter((c) =>
          c.name.toLowerCase().includes(keyword.toLowerCase())
        );
      }

      // 정렬
      if (sort === 'createdAtDesc') {
        filteredCrews.sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      }

      if (sort === 'lastSessionDesc') {
        const lastSessionAt = (crewId: number) =>
          Math.max(
            0,
            ...sessions
              .filter((session) => session.crewId === crewId)
              .map((session) => new Date(session.sessionAt).getTime())
          );
        filteredCrews.sort((a, b) => lastSessionAt(b.id) - lastSessionAt(a.id));
      }

      if (sort === 'memberCountDesc') {
        filteredCrews.sort((a, b) => b.memberCount - a.memberCount);
      }

      if (sort === 'nameAsc') {
        filteredCrews.sort((a, b) => a.name.localeCompare(b.name));
      }

      if (sort === 'nameDesc') {
        filteredCrews.sort((a, b) => b.name.localeCompare(a.name));
      }

      // 무한스크롤
      const startIndex = page * size;
      const endIndex = startIndex + size;
      const paginatedCrews = filteredCrews.slice(startIndex, endIndex);
      const hasNext = endIndex < filteredCrews.length;

      const content = paginatedCrews.map((crew) => {
        return {
          id: crew.id,
          name: crew.name,
          description: crew.description,
          city: crew.city,
          image: crew.image,
          memberCount: crew.memberCount,
          createdAt: crew.createdAt,
        };
      });

      const data = {
        content: content,
        hasNext: hasNext,
      };

      return HttpResponse.json(successResponse(data), { status: 200 });
    }),

    // 크루 상세 조회
    http.get(p('/api/crews/:id'), ({ params }) => {
      const crew = findCrew(params.id);
      if (!crew) return HttpResponse.json(null, { status: 404 });

      const { id, name, description, city, image, memberCount, createdAt } =
        crew;
      const data = {
        id,
        name,
        description,
        city,
        image,
        memberCount,
        createdAt,
      };

      return HttpResponse.json(successResponse(data), { status: 200 });
    }),

    // 크루 멤버 목록 조회
    http.get(p('/api/crews/:id/members'), ({ params }) => {
      const crew = findCrew(params.id);
      const data = { members: crew ? crewMembers(crew) : [] };

      return HttpResponse.json(successResponse(data), { status: 200 });
    }),

    // 크루 멤버 역할별 카운트 조회
    http.get(p('/api/crews/:id/members/count'), ({ params }) => {
      const crew = findCrew(params.id);
      const members = crew ? crewMembers(crew) : [];
      const data = {
        leaderCount: members.filter((m) => m.role === 'LEADER').length,
        staffCount: members.filter((m) => m.role === 'STAFF').length,
        memberCount: members.filter((m) => m.role === 'MEMBER').length,
      };

      return HttpResponse.json(successResponse(data), { status: 200 });
    }),

    http.get(p('/api/crews/:crewId/members/:userId/role'), ({ params }) => {
      const userId = parseIdParam(params.userId);

      const data = {
        userId: userId,
        role: faker.helpers.arrayElement(['LEADER', 'STAFF', 'MEMBER']),
      };

      return HttpResponse.json(successResponse(data), { status: 200 });
    }),

    // 크루장 변경 (리더 위임)
    http.patch(
      p('/api/crews/:crewId/leader'),
      requireAuth(authMode, async ({ request }) => {
        const body = (await request.json()) as { newLeaderId: number };
        const newLeaderId = body.newLeaderId;

        const data = { oldLeaderId: 1, newLeaderId: newLeaderId };

        return HttpResponse.json(successResponse(data), { status: 200 });
      })
    ),

    // 운영진(Staff) 등록/해제
    http.patch(
      p('/api/crews/:crewId/members/:userId/role'),
      requireAuth(authMode, async ({ params, request }) => {
        const userId = parseIdParam(params.userId);
        const body = (await request.json()) as { role: 'STAFF' | 'MEMBER' };
        const newRole = body.role;

        const data = {
          userId: userId,
          previousRole: 'MEMBER',
          newRole: newRole,
          message: '운영진으로 등록되었습니다.',
        };

        return HttpResponse.json(successResponse(data), { status: 200 });
      })
    ),

    // 크루 멤버 강퇴
    http.delete(
      p('/api/crews/:crewId/members/:userId'),
      requireAuth(authMode, ({ params }) => {
        const userId = parseIdParam(params.userId);

        const data = {
          message: '해당 사용자가 크루에서 제거되었습니다.',
          userId: userId,
        };

        return HttpResponse.json(successResponse(data), { status: 200 });
      })
    ),

    // 크루 정보 수정
    http.patch(
      p('/api/crews/:id'),
      requireAuth(authMode, async ({ params, request }) => {
        const crewId = parseIdParam(params.id);
        const body = (await request.json()) as Partial<CreateCrewRequest>;

        const data = {
          id: crewId!,
          name: body.name || '기존 크루 이름',
          description: body.description || '기존 크루 설명',
          city: body.city || '기존 크루 도시',
          image: body.image || null,
          createdAt: new Date().toISOString(),
        };

        return HttpResponse.json(successResponse(data), { status: 200 });
      })
    ),

    // 크루 삭제
    http.delete(
      p('/api/crews/:id'),
      requireAuth(authMode, () => {
        const data = {
          message: '크루가 삭제되었습니다.',
        };

        return HttpResponse.json(successResponse(data), { status: 200 });
      })
    ),

    // 크루 가입
    http.post(
      p('/api/crews/:crewId/join'),
      requireAuth(authMode, () => {
        const data = {
          crewId: 1,
          userId: 1,
          role: 'MEMBER',
          joinedAt: new Date().toISOString(),
        };

        return HttpResponse.json(successResponse(data), { status: 201 });
      })
    ),

    // 크루 탈퇴
    http.delete(
      p('/api/crews/:crewId/leave'),
      requireAuth(authMode, () => {
        const data = {
          message: '크루를 탈퇴했습니다.',
        };

        return HttpResponse.json(successResponse(data), { status: 200 });
      })
    ),
  ];
}
