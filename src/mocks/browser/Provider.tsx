'use client';

import { useEffect, useState } from 'react';

declare global {
  // msw가 한 번만 시작되도록 전역 플래그를 설정합니다.
  var __mswStarted: boolean | undefined;
}

export default function MockProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const shouldMock = process.env.NEXT_PUBLIC_USE_MSW === 'true';

  const [ready, setReady] = useState(!shouldMock);

  useEffect(() => {
    if (!shouldMock) return;

    if (globalThis.__mswStarted) {
      setReady(true);
      return;
    }

    globalThis.__mswStarted = true;

    import('.')
      .then(({ worker }) =>
        worker.start({
          onUnhandledRequest: 'bypass',
        })
      )
      .then(() => {
        setReady(true);
      })
      .catch((error) => {
        console.error('Failed to start MSW:', error);
        setReady(true);
      });
  }, [shouldMock]);

  if (!ready) return null;

  return (
    <>
      {shouldMock && (
        <p className="bg-gray-800 py-1.5 text-center text-xs text-gray-200">
          백엔드 서버 운영이 끝나 목 데이터(MSW)로 동작하는 데모입니다. 아무
          이메일·비밀번호로 로그인할 수 있어요.
        </p>
      )}
      {children}
    </>
  );
}
