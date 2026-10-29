/**
 * 앱 전체가 공유하는 작은 선 그림(SVG) 모음입니다.
 * 아이콘 파일이나 외부 서비스를 내려받지 않고, 이름에 대응하는 도형을 코드로 그립니다.
 */
/** name으로 모양, size로 너비·높이, className/props로 추가 속성을 지정한 SVG를 반환합니다. */
export function Icon({ name, size = 22, className = "", ...props }) {
  // SVG의 path·rect·circle은 각각 선의 경로·사각형·원입니다. 좌표는 공통 24×24 기준입니다.
  const paths = {
    home: (
      <>
        <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z" />
      </>
    ),
    book: (
      <>
        <path d="M4 4h6a3 3 0 0 1 3 3v14a4 4 0 0 0-4-3H4Z" />
        <path d="M13 7a3 3 0 0 1 3-3h5v14h-4a4 4 0 0 0-4 3" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
    back: <path d="M19 12H5m6-6-6 6 6 6" />,
    image: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="4" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <path d="m21 15-5-5-7 8-3-3-3 3" />
      </>
    ),
    chat: (
      <>
        <path d="M21 11a8 8 0 0 1-8 8H8l-5 3V11a9 9 0 0 1 18 0Z" />
        <path d="M8 10h8M8 14h5" />
      </>
    ),
    edit: (
      <>
        <path d="m16 3 5 5-11 11-6 1 1-6Z" />
        <path d="m13 6 5 5" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="3" />
        <path d="M7 3v4m10-4v4M3 11h18m-13 4h2m4 0h2" />
      </>
    ),
    pin: (
      <>
        <path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" />
        <circle cx="12" cy="10" r="2" />
      </>
    ),
    search: (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 5 5" />
      </>
    ),
    trash: (
      <>
        <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" />
      </>
    ),
    help: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M9.5 9a2.5 2.5 0 0 1 5 .5c0 2-2.5 1.5-2.5 4M12 17h.01" />
      </>
    ),
    lock: (
      <>
        <rect x="5" y="10" width="14" height="11" rx="3" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" />
      </>
    ),
    cloud: (
      <>
        <path d="M7 18a5 5 0 1 1 1-10 6 6 0 0 1 11 3 3.5 3.5 0 0 1-1 7Z" />
      </>
    ),
    spark: (
      <>
        <path d="m12 3 2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6Z" />
        <path d="m20 2 1 2m-2-1h3" />
      </>
    ),
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v6m0-10h.01" />
      </>
    ),
    retry: (
      <>
        <path d="M20 7v5h-5M4 17v-5h5" />
        <path d="M5.5 8a7 7 0 0 1 11-3L20 9M4 15l3.5 4a7 7 0 0 0 11-3" />
      </>
    ),
    chevron: <path d="m9 5 7 7-7 7" />,
  };
  // 색은 부모 글자색(currentColor)을 따릅니다. 장식 아이콘은 숨기고 버튼의 문구·aria-label로 뜻을 알립니다.
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      {paths[name] || paths.spark}
    </svg>
  );
}
