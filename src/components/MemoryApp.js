"use client";

/**
 * 사용자가 조작하는 앱 화면의 시작점입니다.
 * React 상태는 현재 화면과 입력을, memoryApi는 서버 통신을, 분리한 컴포넌트는 반복 표시를 맡습니다.
 * "use client" 아래에서 불러오는 모듈도 브라우저 코드가 되므로 비밀 키나 DB 접근 코드를 넣지 않습니다.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "./icons";
import { memoryApi, preparePhoto } from "@/lib/client/memory-api";
import { answered, formatDate, statusLabel, today } from "@/lib/client/memory-display";
import PhotoViewer from "./PhotoViewer";
import ConversationHistory from "./ConversationHistory";
import Spinner from "./memory/Spinner";
import PhotoStrip from "./memory/PhotoStrip";
import MemoryCard from "./memory/MemoryCard";
import EmptyIllustration from "./memory/EmptyIllustration";
import MemoryDialog from "./memory/MemoryDialog";
import { DEFAULT_QUESTION_LIMIT, MAX_QUESTION_LIMIT, questionLimitFor } from "@/lib/memory-limits";

// localStorage에는 이어 쓸 기록 ID만 보관합니다. 서버의 소유권 판단은 별도의 HttpOnly 쿠키가 맡습니다.
const ACTIVE_KEY = "photo-memory-active-id";

/** 미완성 기록 ID를 이 브라우저에 기억합니다. 저장소 사용이 차단되어도 앱 사용은 계속합니다. */
function remember(id) {
  try {
    if (id) localStorage.setItem(ACTIVE_KEY, id);
    else localStorage.removeItem(ACTIVE_KEY);
  } catch {}
}

/** 사용자 화면의 최상위 구성 요소입니다. 화면 상태와 버튼 동작을 관리하고 서버 작업은 memoryApi에 위임합니다. */
export default function MemoryApp() {
  // useState는 화면이 기억할 값입니다. 값이 바뀌면 React가 필요한 화면을 다시 그립니다.
  // 서버의 기록(active)과 아직 보내지 않은 입력(files/answer/title/content)을 따로 보관합니다.
  const [config, setConfig] = useState(null),
    [memories, setMemories] = useState([]),
    [booting, setBooting] = useState(true),
    [view, setView] = useState("home"),
    [active, setActive] = useState(null),
    [files, setFiles] = useState([]),
    [date, setDate] = useState(""),
    [place, setPlace] = useState(""),
    [questionLimit, setQuestionLimit] = useState(DEFAULT_QUESTION_LIMIT),
    [photoViewer, setPhotoViewer] = useState(null),
    [answer, setAnswer] = useState(""),
    [title, setTitle] = useState(""),
    [content, setContent] = useState(""),
    [search, setSearch] = useState(""),
    [pending, setPending] = useState(""),
    [error, setError] = useState(null),
    [notice, setNotice] = useState(""),
    [dialog, setDialog] = useState(null),
    [justSaved, setJustSaved] = useState(false);
  // useRef는 다시 그려도 유지되는 상자입니다. 중복 실행 잠금, DOM 접근, 임시 사진 주소를 담습니다.
  const lock = useRef(false),
    fileRef = useRef(null),
    headingRef = useRef(null),
    fileUrls = useRef([]);
  // 서버가 돌려준 기록 상태에서 현재 질문과 작성 단계를 계산합니다. 별도 상태로 중복 저장하지 않습니다.
  const current = active?.turns?.find((t) => t.answer === null && !t.skipped);
  const activeQuestionLimit = questionLimitFor(active);
  const uploadPhotos = [...(active?.photos || []), ...files];
  /** 선택한 사진 배열과 위치를 기억해 확대창을 엽니다. 서버 데이터는 변경하지 않습니다. */
  function openPhoto(photos, index) { setPhotoViewer({ photos, index }); }
  const composeStage =
    !active || active.status === "upload"
      ? "upload"
      : active.status === "conversation"
        ? "conversation"
        : "editor";
  // dirty는 아직 서버에 보내거나 저장하지 않은 내용이 있는지를 뜻합니다. 이동·닫기 경고의 기준입니다.
  const dirty =
    view === "compose" &&
    (files.length > 0 ||
      !!answer.trim() ||
      (composeStage === "editor" &&
        (title !== (active?.title || "") ||
          content !== (active?.content || ""))));
  /** 서버에서 받은 기록을 현재 화면과 목록에 함께 반영하고 미완성 기록 ID를 기억합니다. */
  const updateMemory = useCallback((memory) => {
    setActive(memory);
    setMemories((list) =>
      [memory, ...list.filter((m) => m.id !== memory.id)].sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt),
      ),
    );
    if (memory.status !== "saved") remember(memory.id);
    return memory;
  }, []);
  /** API 오류를 화면에서 읽을 문구·오류 코드·확인 번호로 정리합니다. */
  const showError = useCallback(
    (p) =>
      setError({
        message: p.message || "잠시 후 다시 시도해 주세요.",
        requestId: p.requestId,
        code: p.code,
      }),
    [],
  );
  /** 버튼 작업의 공통 실행기입니다. 겹친 클릭을 막고 대기 표시·오류·잠금 해제를 한곳에서 처리합니다. */
  const run = useCallback(
    async (label, work) => {
      if (lock.current) return;
      lock.current = true;
      setPending(label);
      setError(null);
      setNotice("");
      try {
        return await work();
      } catch (p) {
        showError(p);
      } finally {
        lock.current = false;
        setPending("");
      }
    },
    [showError],
  );
  /** 첫 실행 시 설정과 목록을 읽고, 이 브라우저에 남은 미완성 기록이 있으면 이어서 불러옵니다. */
  const boot = useCallback(async () => {
    setBooting(true);
    setError(null);
    try {
      const app = await memoryApi.app();
      setConfig(app);
      const data = await memoryApi.list();
      setMemories(data.memories);
      let id;
      try {
        id = localStorage.getItem(ACTIVE_KEY);
      } catch {}
      if (id) {
        try {
          const { memory } = await memoryApi.get(id);
          if (memory.status !== "saved") {
            setActive(memory);
            setDate(memory.date);
            setPlace(memory.place);
            setQuestionLimit(questionLimitFor(memory));
            setTitle(memory.title || "");
            setContent(memory.content || "");
          } else remember(null);
        } catch {
          remember(null);
        }
      }
    } catch (p) {
      showError(p);
    } finally {
      setDate((v) => v || today());
      setBooting(false);
    }
  }, [showError]);
  // 첫 화면이 준비되면 초기 조회를 시작합니다. useCallback으로 boot의 불필요한 재생성을 줄입니다.
  useEffect(() => {
    boot();
  }, [boot]);
  // 새로고침·탭 닫기 시 미전송 입력이나 처리 중인 작업을 잃지 않도록 브라우저에 경고를 요청합니다.
  useEffect(() => {
    const unload = (e) => {
      if (dirty || pending) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", unload);
    return () => window.removeEventListener("beforeunload", unload);
  }, [dirty, pending]);
  // 화면 전환 후 제목으로 초점을 옮겨 키보드·화면 낭독기 사용자가 현재 위치를 알게 합니다.
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, [view, composeStage]);
  // 구성 요소가 사라지면 브라우저 메모리에 만든 사진 미리보기 주소를 모두 해제합니다.
  useEffect(
    () => () => {
      fileUrls.current.forEach((u) => URL.revokeObjectURL(u));
    },
    [],
  );
  // 짧은 알림은 6초 뒤 닫고, 알림이 바뀌거나 화면이 사라지면 이전 타이머를 정리합니다.
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 6000);
    return () => clearTimeout(timer);
  }, [notice]);
  /** 임시 사진과 확대창을 닫고 object URL을 해제합니다. 서버에 업로드된 사진은 지우지 않습니다. */
  function clearFiles() {
    setPhotoViewer(null);
    fileUrls.current.forEach((u) => URL.revokeObjectURL(u));
    fileUrls.current = [];
    setFiles([]);
  }
  /** next 화면으로 이동합니다. 미저장 입력이 있으면 이동을 확인한 뒤 선택적 action을 실행합니다. */
  function navigate(next, action) {
    if (pending || booting) return;
    const go = () => {
      setDialog(null);
      setError(null);
      setJustSaved(false);
      setView(next);
      if (action) action();
      window.scrollTo({ top: 0, behavior: "instant" });
    };
    if (dirty) setDialog({ type: "leave", action: go });
    else go();
  }
  /** 새 기록 작성을 시작하며 이전 화면의 미전송 입력을 초기값으로 되돌립니다. */
  function beginNew() {
    navigate("compose", () => {
      clearFiles();
      setActive(null);
      setDate(today());
      setPlace("");
      setQuestionLimit(DEFAULT_QUESTION_LIMIT);
      setAnswer("");
      setTitle("");
      setContent("");
    });
  }
  /** ID로 서버 기록을 불러와 저장 여부에 따라 읽기 화면 또는 이어쓰기 화면을 엽니다. */
  async function openMemory(id) {
    if (pending) return;
    const open = () =>
      run("기록을 불러오고 있어요", async () => {
        const { memory } = await memoryApi.get(id);
        clearFiles();
        updateMemory(memory);
        setAnswer("");
        setDate(memory.date);
        setPlace(memory.place);
        setQuestionLimit(questionLimitFor(memory));
        setTitle(memory.title || "");
        setContent(memory.content || "");
        setJustSaved(false);
        setView(memory.status === "saved" ? "detail" : "compose");
        setDialog(null);
        window.scrollTo({ top: 0, behavior: "instant" });
      });
    if (dirty) setDialog({ type: "leave", action: open });
    else await open();
  }
  /** 파일 선택 이벤트를 받아 사진 수를 확인하고, 전송용 JPEG와 임시 미리보기를 준비합니다. */
  async function handleFiles(event) {
    const selected = Array.from(event.target.files || []);
    event.target.value = "";
    if (!selected.length) return;
    if (files.length + (active?.photos?.length || 0) + selected.length > 3) {
      setError({
        message:
          "사진은 최대 3장까지 선택할 수 있어요. 먼저 고른 사진을 확인해 주세요.",
      });
      return;
    }
    await run("사진을 준비하고 있어요", async () => {
      const prepared = [];
      try {
        for (const file of selected) {
          const photo = await preparePhoto(file);
          prepared.push({
            file: photo,
            url: URL.createObjectURL(photo),
            id: `${Date.now()}-${prepared.length}`,
            name: file.name,
          });
        }
      } catch (p) {
        prepared.forEach((item) => URL.revokeObjectURL(item.url));
        throw p;
      }
      fileUrls.current.push(...prepared.map((p) => p.url));
      setFiles((existing) => [...existing, ...prepared]);
    });
  }
  /** 아직 업로드하지 않은 사진 하나를 선택 해제하고 그 미리보기 주소만 해제합니다. */
  function removeFile(id) {
    const photo = files.find((p) => p.id === id);
    if (photo) {
      URL.revokeObjectURL(photo.url);
      fileUrls.current = fileUrls.current.filter((u) => u !== photo.url);
    }
    setFiles((items) => items.filter((p) => p.id !== id));
    setError(null);
  }
  /** 폼 제출을 받아 기록 생성 → 사진 업로드 → 대화 시작을 차례로 진행합니다. 성공 단계는 서버에 남습니다. */
  async function startMemory(event) {
    event.preventDefault();
    if (!date) {
      setError({ message: "기록할 날짜를 선택해 주세요." });
      return;
    }
    if (!files.length && !active?.photos?.length) {
      setError({ message: "이야기를 시작할 사진을 한 장 이상 골라 주세요." });
      fileRef.current?.focus();
      return;
    }
    await run("사진을 보며 첫 질문을 준비하고 있어요", async () => {
      let memory = active;
      if (!memory) {
        const created = await memoryApi.create(date, place.trim(), questionLimit);
        memory = updateMemory(created.memory);
      }
      if (files.length) {
        const uploaded = await memoryApi.upload(
          memory.id,
          files.map((p) => p.file),
        );
        memory = updateMemory(uploaded.memory);
        clearFiles();
      }
      const started = await memoryApi.start(memory.id, questionLimit);
      updateMemory(started.memory);
      setAnswer("");
    });
  }
  /** 현재 질문 ID와 답변을 전송합니다. skipped=true이면 건너뛰며 최소 한 개의 실제 답변은 필요합니다. */
  async function submitAnswer(skipped = false) {
    if (!current || !active) return;
    if (!skipped && !answer.trim()) {
      setError({ message: "떠오르는 기억을 한 문장만 적어 주세요." });
      return;
    }
    if (skipped && active.turns.length >= activeQuestionLimit && answered(active) === 0) {
      setError({
        message:
          "기록을 만들려면 답변이 하나는 필요해요. 마지막 질문에 짧게라도 답해 주세요.",
      });
      return;
    }
    await run(
      skipped ? "다음 질문으로 넘어가고 있어요" : "답변을 담고 있어요",
      async () => {
        const data = await memoryApi.answer(
          active.id,
          current.id,
          answer.trim(),
          skipped,
        );
        updateMemory(data.memory);
        setAnswer("");
      },
    );
  }
  /** 저장된 답변으로 초안을 요청하고 결과의 제목·본문을 편집창에 채웁니다. 최종 저장과는 별개입니다. */
  async function makeDraft() {
    if (!active || !answered(active)) {
      setError({ message: "기록을 만들려면 질문에 한 번 이상 답해 주세요." });
      return;
    }
    await run("답변을 글로 옮기고, 빠진 기억과 문장을 확인하고 있어요. 최대 3분 정도 걸릴 수 있어요", async () => {
      const { memory } = await memoryApi.draft(active.id);
      updateMemory(memory);
      setTitle(memory.title || "");
      setContent(memory.content || "");
      setAnswer("");
    });
  }
  /** 확인창에서 승인한 뒤 기존 질문·답변으로 초안을 다시 요청합니다. 저장 버전도 함께 전달합니다. */
  async function regenerateDraft() {
    setDialog(null);
    if (!active || active.status !== "draft") return;
    await run("원래 답변을 다시 읽고 초안을 쓰고 있어요. 최대 3분 정도 걸릴 수 있어요", async () => {
      const { memory } = await memoryApi.draft(active.id, { regenerate: true, version: active.version });
      updateMemory(memory);
      setTitle(memory.title || "");
      setContent(memory.content || "");
    });
  }
  /** 편집한 제목·본문과 현재 version을 보냅니다. 서버의 버전 검사가 다른 화면의 변경 덮어쓰기를 막습니다. */
  async function saveMemory(event) {
    event.preventDefault();
    if (!title.trim() || !content.trim()) {
      setError({ message: "제목과 내용을 모두 적어 주세요." });
      return;
    }
    await run("기록을 저장하고 있어요", async () => {
      const { memory } = await memoryApi.save(
        active.id,
        title.trim(),
        content.trim(),
        active.version,
      );
      updateMemory(memory);
      remember(null);
      setJustSaved(true);
      setView("detail");
      setTitle(memory.title);
      setContent(memory.content);
      window.scrollTo({ top: 0, behavior: "instant" });
    });
  }
  /** 삭제 확인 후 서버의 기록·사진 삭제를 요청하고 성공했을 때만 화면 목록에서도 제거합니다. */
  async function deleteMemory(memory) {
    await run("기록을 삭제하고 있어요", async () => {
      await memoryApi.remove(memory.id);
      setMemories((items) => items.filter((m) => m.id !== memory.id));
      if (active?.id === memory.id) {
        setActive(null);
        clearFiles();
        setAnswer("");
        remember(null);
      }
      setDialog(null);
      setView("archive");
      setNotice("기록을 삭제했어요.");
    });
  }
  // 검색은 이미 불러온 이 브라우저의 목록에서 수행합니다. 검색어 자체를 AI나 외부 서비스에 보내지 않습니다.
  const shown = memories.filter((m) =>
    `${m.title || ""} ${m.content || ""} ${m.place || ""} ${m.date || ""}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const unfinished =
    active && active.status !== "saved"
      ? active
      : memories.find((m) => m.status !== "saved");
  // 같은 화면 틀을 재사용하면서 현재 보기와 작성 단계에 맞는 제목·설명만 선택합니다.
  const pageTitle =
    view === "home"
      ? "기억은 사진 밖에도\n있으니까."
      : view === "archive"
        ? "차곡차곡, 나의 하루."
        : view === "detail"
          ? justSaved
            ? "오늘의 기억을 남겼어요."
            : "사진 너머의 이야기."
          : composeStage === "upload"
            ? "어떤 하루를 꺼내볼까요?"
            : composeStage === "conversation"
              ? "그날의 이야기를 들려주세요."
              : "당신의 말로 채운 하루.";
  const pageDescription =
    view === "home"
      ? "사진에 담기지 않은 대화와 마음까지.\n작은 질문을 따라 나만의 기록을 남겨보세요."
      : view === "archive"
        ? "함께 꺼내본 기억과 아직 쓰고 있는 이야기를 모았어요."
        : view === "detail"
          ? justSaved
            ? "사진과 함께, 다시 펼쳐볼 이야기가 생겼어요."
            : "그날의 장면과 마음을 천천히 다시 읽어보세요."
          : composeStage === "upload"
            ? "사진을 단서로, 당신만 아는 이야기를 함께 찾아요."
            : composeStage === "conversation"
              ? "정답은 없어요. 선명하게 떠오르는 것부터 적어보세요."
              : "들려준 이야기를 정리했어요. 내 목소리로 다듬고 저장하세요.";
  // 아래 JSX는 화면 설계도입니다. 중괄호 안의 값·조건을 React가 실제 HTML 요소로 바꿉니다.
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        본문으로 건너뛰기
      </a>
      <aside className="sidebar">
        <button
          className="brand"
          onClick={() => navigate("home")}
          disabled={!!pending}
        >
          <span className="brand-mark">
            <Icon name="image" size={25} />
          </span>
          <span>
            사진 너머<small>YOUR DAYS, IN YOUR WORDS</small>
          </span>
        </button>
        <div className="sidebar-label">나의 공간</div>
        <nav className="desktop-nav" aria-label="주 메뉴">
          <button
            className={view === "home" ? "selected" : ""}
            aria-current={view === "home" ? "page" : undefined}
            onClick={() => navigate("home")}
            disabled={!!pending}
          >
            <Icon name="home" />
            오늘의 시작
          </button>
          <button
            className={
              view === "archive" || view === "detail" ? "selected" : ""
            }
            onClick={() => navigate("archive")}
            disabled={!!pending}
          >
            <Icon name="book" />
            나의 기록
            <span className="nav-count">
              {memories.filter((m) => m.status === "saved").length}
            </span>
          </button>
        </nav>
        <button
          className="button primary sidebar-new"
          onClick={beginNew}
          disabled={!!pending || booting}
        >
          <Icon name="plus" size={20} />새 기억 남기기
        </button>
        <div className="sidebar-bottom">
          <div className="private-note">
            <Icon name="lock" size={19} />
            <p>
              사진은 단서가 되고,
              <br />
              이야기는 당신이 만들어요.
            </p>
          </div>
          <button
            className="help-button"
            onClick={() => setDialog({ type: "help" })}
          >
            <Icon name="help" size={19} />
            이용 및 보관 안내
          </button>
          <div className="cloud-credit">
            <Icon name="cloud" size={17} />
            <span>NAVER Cloud 기반 프로젝트</span>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <button
            className="mobile-brand"
            onClick={() => navigate("home")}
            disabled={!!pending}
          >
            <span className="brand-mark">
              <Icon name="image" size={20} />
            </span>
            사진 너머
          </button>
          <span className="topbar-date">
            <Icon name="calendar" size={17} />
            {formatDate(date, true)}
          </span>
          <div className="topbar-actions">
            {config && (
              <span
                className={`mode-pill ${config.mode === "demo" ? "demo" : ""}`}
              >
                <span />
                {config.mode === "demo" ? "체험 모드" : "Ncloud 모드"}
              </span>
            )}
            <button
              className="icon-button"
              aria-label="이용 및 보관 안내"
              onClick={() => setDialog({ type: "help" })}
            >
              <Icon name="help" size={21} />
            </button>
          </div>
        </header>
        <main id="main-content" className={`main-content view-${view}`}>
          {config?.mode === "demo" && (
            <div className="mode-banner">
              <Icon name="info" size={17} />
              <span>
                <strong>체험 모드</strong> · 실제 AI 호출 없이 질문·답변과 기록
                저장 흐름을 경험해요.
              </span>
            </div>
          )}
          {config?.mode === "ncloud" && config.configured === false && (
            <div className="configuration-banner">
              <Icon name="info" />
              <span>
                Ncloud 연결 설정이 필요해요. 서버 환경 설정을 확인한 뒤 다시
                시작해 주세요.
              </span>
            </div>
          )}
          {(view === "compose" || view === "detail") && (
            <button
              className="back-button"
              onClick={() => navigate(view === "detail" ? "archive" : "home")}
              disabled={!!pending}
            >
              <Icon name="back" size={19} />
              {view === "detail" ? "나의 기록" : "처음으로"}
            </button>
          )}
          <div className="page-heading">
            <span className="eyebrow">
              {view === "home"
                ? "A MOMENT, A MEMORY"
                : view === "archive"
                  ? "MY LITTLE ARCHIVE"
                  : view === "detail"
                    ? "A DAY TO REMEMBER"
                    : "ONE DAY, YOUR STORY"}
            </span>
            <h1 ref={headingRef} tabIndex={-1}>
              {pageTitle}
            </h1>
            <p>{pageDescription}</p>
          </div>
          {error && (
            <div className="error-box" role="alert">
              <Icon name="info" size={22} />
              <div>
                <strong>잠깐, 확인이 필요해요.</strong>
                <p>{error.message}</p>
                {error.requestId && <small>확인 번호: {error.requestId}</small>}
                {!booting && !config && (
                  <button className="text-button" onClick={boot}>
                    <Icon name="retry" size={16} />
                    다시 연결하기
                  </button>
                )}
              </div>
              <button
                className="icon-button"
                onClick={() => setError(null)}
                aria-label="오류 안내 닫기"
              >
                <Icon name="close" size={18} />
              </button>
            </div>
          )}
          <div className="sr-only" role="status" aria-live="polite">
            {pending || notice}
          </div>
          {booting ? (
            <div className="loading-card">
              <Spinner />
              <span>나의 공간을 준비하고 있어요.</span>
            </div>
          ) : (
            <>
              {/* 홈: 앱 소개와 최근 기록, 미완성 기록의 이어쓰기 진입점을 표시합니다. */}
              {view === "home" && (
                <>
                  <section className="welcome-card">
                    <div className="welcome-copy">
                      <span className="section-kicker">
                        <span />
                        오늘을 조금 더 오래
                      </span>
                      <h2>
                        한 장의 사진에서,
                        <br />한 편의 나로.
                      </h2>
                      <p>
                        사진을 고르고, 질문에 답하고.
                        <br />
                        흘려보낸 하루가 나만의 이야기가 돼요.
                      </p>
                      <button
                        className="button primary hero-button"
                        onClick={beginNew}
                        disabled={!!pending}
                      >
                        <Icon name="plus" size={20} />
                        사진으로 기억 꺼내기
                        <Icon name="arrow" size={19} />
                      </button>
                      <span className="hero-footnote">
                        사진 1~3장 · 질문은 1~10개 선택 · 나의 말로 완성
                      </span>
                    </div>
                    <EmptyIllustration />
                  </section>
                  <section className="how-section" aria-label="기록하는 순서">
                    <div>
                      <span className="step-icon">
                        <Icon name="image" />
                      </span>
                      <div>
                        <small>01</small>
                        <h3>사진을 골라요</h3>
                        <p>기억하고 싶은 순간</p>
                      </div>
                    </div>
                    <span className="step-connector" />
                    <div>
                      <span className="step-icon">
                        <Icon name="chat" />
                      </span>
                      <div>
                        <small>02</small>
                        <h3>이야기를 나눠요</h3>
                        <p>질문을 따라 떠오른 기억</p>
                      </div>
                    </div>
                    <span className="step-connector" />
                    <div>
                      <span className="step-icon">
                        <Icon name="edit" />
                      </span>
                      <div>
                        <small>03</small>
                        <h3>나의 글로 남겨요</h3>
                        <p>직접 다듬어 완성하는 하루</p>
                      </div>
                    </div>
                  </section>
                  {unfinished && (
                    <button
                      className="resume-card"
                      onClick={() => openMemory(unfinished.id)}
                      disabled={!!pending}
                    >
                      <span className="resume-icon">
                        <Icon name="edit" />
                      </span>
                      <span>
                        <strong>쓰다 만 이야기가 기다리고 있어요.</strong>
                        <small>
                          {formatDate(unfinished.date)} ·{" "}
                          {statusLabel[unfinished.status]}
                        </small>
                      </span>
                      <span className="resume-action">
                        이어서 쓰기
                        <Icon name="arrow" size={18} />
                      </span>
                    </button>
                  )}
                  <section className="recent-section">
                    <div className="section-heading">
                      <div>
                        <h2>
                          최근에 꺼낸 기억
                          <span className="count-chip">{memories.length}</span>
                        </h2>
                        <p>작은 순간들이 모여, 나만의 이야기가 돼요.</p>
                      </div>
                      <button
                        className="text-button"
                        onClick={() => navigate("archive")}
                      >
                        모두 보기
                        <Icon name="chevron" size={16} />
                      </button>
                    </div>
                    {memories.length ? (
                      <div className="memory-grid">
                        {memories.slice(0, 3).map((m, i) => (
                          <MemoryCard
                            key={m.id}
                            memory={m}
                            index={i}
                            onOpen={openMemory}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="empty-card">
                        <span className="empty-icon">
                          <Icon name="book" size={28} />
                        </span>
                        <h3>첫 이야기를 기다리고 있어요.</h3>
                        <p>
                          거창한 하루가 아니어도 괜찮아요.
                          <br />
                          오늘 찍은 사진 한 장이면 충분해요.
                        </p>
                        <button className="text-button" onClick={beginNew}>
                          첫 기억 남기기
                          <Icon name="arrow" size={17} />
                        </button>
                      </div>
                    )}
                  </section>
                </>
              )}
              {/* 기록 목록: 검색 결과를 카드로 표시하고 클릭하면 서버의 최신 기록을 조회합니다. */}
              {view === "archive" && (
                <>
                  <div className="archive-tools">
                    <div className="search-field">
                      <Icon name="search" size={20} />
                      <label htmlFor="memory-search" className="sr-only">
                        기록 검색
                      </label>
                      <input
                        id="memory-search"
                        type="search"
                        placeholder="제목, 내용, 장소로 기억 찾기"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </div>
                    <button
                      className="button primary"
                      onClick={beginNew}
                      disabled={!!pending}
                    >
                      <Icon name="plus" size={19} />새 기억
                    </button>
                  </div>
                  <div className="archive-caption">
                    <span>
                      전체 <strong>{memories.length}</strong>개의 이야기
                    </span>
                    <span>최근 작성 순</span>
                  </div>
                  {shown.length ? (
                    <div className="memory-grid archive-grid">
                      {shown.map((m, i) => (
                        <MemoryCard
                          key={m.id}
                          memory={m}
                          index={i}
                          onOpen={openMemory}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="empty-card">
                      <span className="empty-icon">
                        <Icon name={search ? "search" : "book"} size={30} />
                      </span>
                      <h3>
                        {search
                          ? "아직 찾는 기억이 없어요."
                          : "나의 첫 페이지를 열어볼까요?"}
                      </h3>
                      <p>
                        {search
                          ? "다른 단어나 날짜로 다시 찾아보세요."
                          : "사진과 함께, 오늘의 이야기를 남겨보세요."}
                      </p>
                      {!search && (
                        <button className="button primary" onClick={beginNew}>
                          새 기억 남기기
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
              {/* 작성: 서버 상태에 따라 사진 준비 → 대화 → 초안 편집 화면 중 하나를 표시합니다. */}
              {view === "compose" && (
                <>
                  <div className="compose-topline">
                    <ol className="progress-steps" aria-label="기록 작성 단계">
                      {[
                        ["upload", "사진 고르기"],
                        ["conversation", "기억 꺼내기"],
                        ["editor", "기록 완성하기"],
                      ].map(([step, label], i) => {
                        const pos = [
                          "upload",
                          "conversation",
                          "editor",
                        ].indexOf(composeStage);
                        return (
                          <li
                            key={step}
                            className={
                              pos === i ? "current" : pos > i ? "complete" : ""
                            }
                            aria-current={pos === i ? "step" : undefined}
                          >
                            <span>
                              {pos > i ? (
                                <Icon name="check" size={16} />
                              ) : (
                                i + 1
                              )}
                            </span>
                            {label}
                          </li>
                        );
                      })}
                    </ol>
                    {active && (
                      <button
                        className="text-button discard-record"
                        type="button"
                        onClick={() =>
                          setDialog({ type: "delete", memory: active })
                        }
                        disabled={!!pending}
                      >
                        <Icon name="trash" size={16} />이 기록 삭제
                      </button>
                    )}
                  </div>
                  {/* 사진은 브라우저에서 준비한 뒤 시작 버튼을 눌렀을 때 서버에 전송합니다. */}
                  {composeStage === "upload" && (
                    <form onSubmit={startMemory} className="compose-grid">
                      <section className="panel photo-input-panel">
                        <div className="panel-heading">
                          <div>
                            <span className="section-kicker">기억의 시작</span>
                            <h2>사진을 골라 주세요.</h2>
                          </div>
                          <span className="count-chip">
                            {files.length + (active?.photos?.length || 0)} / 3
                          </span>
                        </div>
                        <p className="muted">
                          같은 하루의 사진을 최대 3장까지 함께 볼 수 있어요.
                        </p>
                        <input
                          ref={fileRef}
                          className="file-input"
                          id="photo-input"
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          multiple
                          onChange={handleFiles}
                          disabled={!!pending}
                        />
                        <div className="upload-photos">
                          {active?.photos?.map((p, i) => (
                            <div className="upload-preview" key={p.id}>
                              <button type="button" className="upload-photo-open" onClick={() => openPhoto(uploadPhotos, i)} aria-label={`사진 ${i + 1} 크게 보기`}>
                                <img src={p.url} alt={`전송된 사진 ${i + 1}`} />
                              </button>
                              <span className="uploaded-label">
                                <Icon name="check" size={13} />
                                전송 완료
                              </span>
                            </div>
                          ))}
                          {files.map((p, i) => (
                            <div className="upload-preview" key={p.id}>
                              <button type="button" className="upload-photo-open" onClick={() => openPhoto(uploadPhotos, (active?.photos?.length || 0) + i)} aria-label={`사진 ${(active?.photos?.length || 0) + i + 1} 크게 보기`}>
                                <img src={p.url} alt={`선택한 사진 ${i + 1}`} />
                              </button>
                              <button
                                className="remove-photo"
                                type="button"
                                aria-label={`${p.name} 선택 취소`}
                                onClick={() => removeFile(p.id)}
                                disabled={!!pending}
                              >
                                <Icon name="close" size={17} />
                              </button>
                            </div>
                          ))}
                          {files.length + (active?.photos?.length || 0) < 3 && (
                            <button
                              type="button"
                              className={`upload-zone ${files.length || active?.photos?.length ? "compact" : ""}`}
                              onClick={() => fileRef.current?.click()}
                              disabled={!!pending}
                            >
                              <span className="upload-icon">
                                <Icon name="plus" size={27} />
                              </span>
                              <strong>
                                {files.length || active?.photos?.length
                                  ? "사진 추가"
                                  : "사진 선택하기"}
                              </strong>
                              <span>JPG · PNG · WebP</span>
                              {!files.length && !active?.photos?.length && (
                                <small>
                                  전송 전에 사진 크기를 줄이고
                                  <br />
                                  촬영 위치 정보를 제거해요.
                                </small>
                              )}
                            </button>
                          )}
                        </div>
                        <div className="soft-note">
                          <Icon name="lock" size={17} />
                          <span>
                            전송한 사진은 이 브라우저의 기록에서 확인할 수
                            있어요.
                          </span>
                        </div>
                      </section>
                      <section className="panel day-input-panel">
                        <span className="section-kicker">그날의 단서</span>
                        <h2>언제, 어디였나요?</h2>
                        <p className="muted">기억나는 만큼만 알려주세요.</p>
                        <label className="field-label" htmlFor="memory-date">
                          <Icon name="calendar" size={18} />
                          날짜<span>필수</span>
                        </label>
                        <input
                          className="text-input"
                          id="memory-date"
                          type="date"
                          value={date}
                          onChange={(e) => setDate(e.target.value)}
                          required
                          disabled={!!pending || !!active}
                        />
                        <label className="field-label" htmlFor="memory-place">
                          <Icon name="pin" size={18} />
                          장소<span>선택</span>
                        </label>
                        <input
                          className="text-input"
                          id="memory-place"
                          maxLength={100}
                          placeholder="예: 집 앞 공원, 친구와 간 카페"
                          value={place}
                          onChange={(e) => setPlace(e.target.value)}
                          disabled={!!pending || !!active}
                        />
                        <label className="field-label" htmlFor="question-limit">
                          <Icon name="chat" size={18} />질문 수<span>1~10개</span>
                        </label>
                        <select id="question-limit" className="text-input" value={questionLimit} onChange={(e) => setQuestionLimit(Number(e.target.value))} disabled={!!pending} aria-describedby="question-limit-help">
                          {Array.from({ length: MAX_QUESTION_LIMIT }, (_, i) => i + 1).map((count) => <option key={count} value={count}>{count}개{count === 3 ? " · 가볍게" : count === 5 ? " · 조금 더 자세히" : count === 10 ? " · 천천히 돌아보기" : ""}</option>)}
                        </select>
                        <p id="question-limit-help" className="field-help">
                          질문을 몇 개 받을지 골라 주세요. 한 번 이상 답하면 중간에 기록을 완성해도 괜찮아요. 질문 수는 대화를 시작하면 고정돼요.
                        </p>
                        <div className="question-preview">
                          <Icon name="chat" size={22} />
                          <div>
                            <strong>사진 속에는 어떤 이야기가 있나요?</strong>
                            <p>
                              AI가 단서를 보고 질문할게요.
                              <br />
                              사진에 없는 이야기는 직접 들려주세요.
                            </p>
                          </div>
                        </div>
                        {active && (
                          <p className="field-help">
                            기록을 만들었어요. 날짜와 장소는 현재 고정되어 있고,
                            전송한 사진으로 다시 시작할 수 있어요.
                          </p>
                        )}
                        <div className="form-action">
                          <button
                            className="button primary full"
                            type="submit"
                            disabled={
                              !!pending ||
                              (!files.length && !active?.photos?.length)
                            }
                          >
                            {pending ? (
                              <Spinner small />
                            ) : (
                              <Icon name="spark" size={20} />
                            )}
                            기억 꺼내기 시작
                            <Icon name="arrow" size={19} />
                          </button>
                          <small>
                            {config?.mode === "demo"
                              ? "체험 모드에서는 준비된 질문으로 진행해요."
                              : "첫 질문을 준비하는 데 잠시 시간이 걸릴 수 있어요."}
                          </small>
                        </div>
                      </section>
                    </form>
                  )}
                  {/* 현재 질문과 이미 저장한 답변을 함께 보여주며, 최소 한 답변 뒤 조기 완성이 가능합니다. */}
                  {composeStage === "conversation" && (
                    <div className="conversation-grid">
                      <aside className="photo-context panel">
                        <div className="panel-heading">
                          <div>
                            <span className="section-kicker">
                              이야기의 단서
                            </span>
                            <h2>{formatDate(active.date)}</h2>
                          </div>
                          <Icon name="image" size={23} />
                        </div>
                        {active.place && (
                          <p className="location-line">
                            <Icon name="pin" size={16} />
                            {active.place}
                          </p>
                        )}
                        <PhotoStrip photos={active.photos} large onOpen={openPhoto} />
                        <p className="context-note">
                          사진을 누르면 크게 볼 수 있어요.
                          <br />
                          그날의 이야기는 당신이 가장 잘 알아요.
                        </p>
                        <div className="answered-count">
                          <span>지금까지 모은 기억</span>
                          <strong>
                            {answered(active)}
                            <small>개의 답변</small>
                          </strong>
                        </div>
                      </aside>
                      <section className="conversation-panel">
                        <div className="conversation-top">
                          <span className="ai-label">
                            <Icon name="spark" size={17} />
                            {config?.mode === "demo"
                              ? "기억 도우미 · 체험"
                              : "기억 도우미 · CLOVA"}
                          </span>
                          <span className="question-count">
                            질문 {Math.min(active.turns.length, activeQuestionLimit)} / {activeQuestionLimit}
                          </span>
                        </div>
                        {active.turns
                          .filter((t) => t.answer !== null || t.skipped)
                          .map((t, i) => (
                            <div className="past-turn" key={t.id}>
                              <span className="turn-number">질문 {i + 1}</span>
                              <p className="past-question">{t.question}</p>
                              <div
                                className={`past-answer ${t.skipped ? "skipped" : ""}`}
                              >
                                {t.skipped
                                  ? "이 질문은 건너뛰었어요."
                                  : t.answer}
                              </div>
                            </div>
                          ))}
                        {current ? (
                          <div className="current-turn" key={current.id}>
                            <div className="question-bubble">
                              <span className="question-mark">“</span>
                              <h2>{current.question}</h2>
                              <p>
                                {current.questionSource === "guided"
                                  ? "앞선 질문과 겹치지 않도록 준비된 질문을 골랐어요."
                                  : config?.mode === "demo"
                                  ? "사진을 분석하지 않는 체험 질문이에요."
                                  : "작은 디테일 하나도 좋은 기억이 될 수 있어요."}
                              </p>
                            </div>
                            <form
                              onSubmit={(e) => {
                                e.preventDefault();
                                submitAnswer(false);
                              }}
                            >
                              <label
                                className="field-label"
                                htmlFor="memory-answer"
                              >
                                떠오른 이야기를 적어주세요.
                              </label>
                              <textarea
                                id="memory-answer"
                                className="answer-input"
                                maxLength={2000}
                                rows={5}
                                placeholder="그날 무슨 일이 있었는지, 누구와 어떤 말을 나눴는지… 짧게 적어도 괜찮아요."
                                value={answer}
                                onChange={(e) => setAnswer(e.target.value)}
                                disabled={!!pending}
                              />
                              <div className="input-meta">
                                <span>사진만으로 알 수 없는 나의 이야기</span>
                                <span>{answer.length} / 2,000</span>
                              </div>
                              <div className="answer-actions">
                                <button
                                  className="text-button"
                                  type="button"
                                  onClick={() => submitAnswer(true)}
                                  disabled={
                                    !!pending ||
                                    (active.turns.length >= activeQuestionLimit &&
                                      answered(active) === 0)
                                  }
                                >
                                  이 질문 건너뛰기
                                </button>
                                <button
                                  className="button primary"
                                  type="submit"
                                  disabled={!!pending || !answer.trim()}
                                >
                                  답변 보내기
                                  <Icon name="arrow" size={18} />
                                </button>
                              </div>
                            </form>
                            {answered(active) > 0 && (
                              <button
                                className="early-finish"
                                type="button"
                                onClick={makeDraft}
                                disabled={!!pending || !!answer.trim()}
                              >
                                여기까지의 답변으로 기록 만들기
                                <Icon name="chevron" size={16} />
                              </button>
                            )}
                          </div>
                        ) : (
                          <div className="conversation-done">
                            <span className="done-icon">
                              <Icon name="check" size={30} />
                            </span>
                            <h2>기억의 조각이 모였어요.</h2>
                            <p>
                              {answered(active)
                                ? "들려준 이야기로 기록 초안을 만들어볼까요?\n내용은 다음 화면에서 자유롭게 바꿀 수 있어요."
                                : "아직 답변이 없어요. 기록을 만들려면 적어도 하나의 답변이 필요해요."}
                            </p>
                            <button
                              className="button primary"
                              onClick={makeDraft}
                              disabled={!!pending || !answered(active)}
                            >
                              <Icon name="edit" size={19} />
                              나의 기록 만들기
                              <Icon name="arrow" size={18} />
                            </button>
                          </div>
                        )}
                      </section>
                    </div>
                  )}
                  {/* 제목·본문 편집과 원문 대화 확인을 분리해 AI가 정리한 글을 사용자가 검토하게 합니다. */}
                  {composeStage === "editor" && (
                    <form onSubmit={saveMemory} className="editor-layout">
                      <section className="editor-paper panel">
                        <div className="editor-label">
                          <Icon name="edit" size={18} />
                          <span>나의 기록 다듬기</span>
                          <span className="draft-badge">
                            {active.status === "saved"
                              ? "수정 중"
                              : "저장 전 초안"}
                          </span>
                        </div>
                        <div className="editor-date">
                          {formatDate(active.date, true)}
                          {active.place ? ` · ${active.place}` : ""}
                        </div>
                        <label className="sr-only" htmlFor="record-title">
                          기록 제목
                        </label>
                        <input
                          id="record-title"
                          className="title-input"
                          value={title}
                          onChange={(e) => setTitle(e.target.value)}
                          placeholder="이 하루의 제목"
                          maxLength={80}
                          required
                          disabled={!!pending}
                        />
                        <div className="editor-divider" />
                        <label className="sr-only" htmlFor="record-content">
                          기록 내용
                        </label>
                        <textarea
                          id="record-content"
                          className="content-input"
                          value={content}
                          onChange={(e) => setContent(e.target.value)}
                          placeholder="나의 이야기를 적어주세요."
                          rows={13}
                          maxLength={32000}
                          required
                          disabled={!!pending}
                        />
                        <div className="editor-word-count">
                          {content.length.toLocaleString()}자
                        </div>
                        {active.draftSource === "answers" && (
                          <p className="draft-preservation-note" role="status">
                            AI 글의 형식이나 답변 반영을 확인하지 못해 원문을 모두 담았어요. 초안을 다시 만들거나 직접 다듬어 주세요.
                          </p>
                        )}
                        {active.draftSource === "mixed" && (
                          <p className="draft-preservation-note" role="status">
                            답변이 빠지거나 짧게 요약되지 않도록 {active.preservedAnswerCount}개의 답변은 원문으로 담았어요.
                          </p>
                        )}
                        <PhotoStrip photos={active.photos} onOpen={openPhoto} />
                        <ConversationHistory turns={active.turns} />
                      </section>
                      <aside className="editor-aside">
                        <div className="editor-note panel">
                          <span className="note-icon">
                            <Icon name="spark" size={23} />
                          </span>
                          <h3>
                            마지막 한 줄은,
                            <br />
                            나답게.
                          </h3>
                          <p>
                            들려준 답변으로 만든 초안이에요. 기억과 다른 부분은
                            고치고, 더 남기고 싶은 이야기를 보태 주세요.
                          </p>
                          <div className="soft-note">
                            <Icon name="info" size={17} />
                            <span>
                              {config?.mode === "demo"
                                ? "체험 모드: 답변을 정해진 형식으로 모았어요. AI가 작성한 글이 아니에요."
                                : "사진 관찰을 사실로 채우지 않고, 직접 답한 내용을 중심으로 정리해요."}
                            </span>
                          </div>
                        </div>
                        <div className="save-action">
                          {active.status === "draft" && (
                            <button type="button" className="button secondary full" disabled={!!pending}
                              onClick={() => setDialog({ type: "regenerate", action: regenerateDraft })}>
                              답변으로 초안 다시 만들기
                            </button>
                          )}
                          <button
                            className="button primary full"
                            type="submit"
                            disabled={
                              !!pending || !title.trim() || !content.trim()
                            }
                          >
                            <Icon name="check" size={20} />
                            기록 저장하기
                          </button>
                          <small>
                            저장한 기록은 나의 기록에서 다시 볼 수 있어요.
                          </small>
                        </div>
                      </aside>
                    </form>
                  )}
                </>
              )}
              {/* 저장된 기록: 본문·사진·질문과 답변 원문을 다시 읽고 편집 또는 삭제할 수 있습니다. */}
              {view === "detail" && active && (
                <>
                  {justSaved && (
                    <div className="saved-banner" role="status">
                      <span>
                        <Icon name="check" size={19} />
                      </span>
                      <div>
                        <strong>소중한 하루를 저장했어요.</strong>
                        <p>언제든 다시 읽고, 나의 말로 수정할 수 있어요.</p>
                      </div>
                    </div>
                  )}
                  <article className="detail-paper panel">
                    <div className="detail-meta">
                      <span>
                        <Icon name="calendar" size={17} />
                        {formatDate(active.date, true)}
                      </span>
                      {active.place && (
                        <span>
                          <Icon name="pin" size={17} />
                          {active.place}
                        </span>
                      )}
                      <span className="status-badge saved">저장 완료</span>
                    </div>
                    <h2>{active.title}</h2>
                    <PhotoStrip photos={active.photos} large onOpen={openPhoto} />
                    <div className="record-prose">{active.content}</div>
                    <ConversationHistory turns={active.turns} />
                    <div className="detail-footer">
                      <span>
                        <Icon name="lock" size={16} />이 브라우저에서 보관하는
                        나의 이야기
                      </span>
                      <div>
                        <button
                          className="text-button"
                          onClick={() => {
                            setTitle(active.title);
                            setContent(active.content);
                            setView("compose");
                            setJustSaved(false);
                          }}
                          disabled={!!pending}
                        >
                          <Icon name="edit" size={17} />
                          수정하기
                        </button>
                        <button
                          className="text-button danger-text"
                          onClick={() =>
                            setDialog({ type: "delete", memory: active })
                          }
                          disabled={!!pending}
                        >
                          <Icon name="trash" size={17} />
                          삭제
                        </button>
                      </div>
                    </div>
                  </article>
                  <div className="detail-bottom">
                    <button
                      className="button secondary"
                      onClick={() => navigate("archive")}
                    >
                      <Icon name="book" size={19} />
                      나의 기록 보기
                    </button>
                    <button className="button primary" onClick={beginNew}>
                      <Icon name="plus" size={19} />
                      다른 기억 남기기
                    </button>
                  </div>
                </>
              )}
            </>
          )}
          {pending && (
            <div className="pending-status" role="status">
              <Spinner small />
              <span>{pending}</span>
              <small>잠시만 기다려 주세요.</small>
            </div>
          )}
          {notice && (
            <div className="toast" role="status">
              <Icon name="check" size={18} />
              {notice}
            </div>
          )}
          <footer className="main-footer">
            <span>사진 너머</span>
            <p>기억하고 싶은 하루, 나의 말로.</p>
            <button onClick={() => setDialog({ type: "help" })}>
              이용 및 보관 안내
            </button>
          </footer>
        </main>
      </div>
      <nav className="mobile-nav" aria-label="모바일 주 메뉴">
        <button
          className={view === "home" ? "selected" : ""}
          onClick={() => navigate("home")}
          disabled={!!pending}
        >
          <Icon name="home" size={23} />
          <span>홈</span>
        </button>
        <button
          className={`mobile-new ${view === "compose" ? "selected" : ""}`}
          onClick={beginNew}
          disabled={!!pending || booting}
        >
          <span>
            <Icon name="plus" size={24} />
          </span>
          <span>새 기억</span>
        </button>
        <button
          className={view === "archive" || view === "detail" ? "selected" : ""}
          onClick={() => navigate("archive")}
          disabled={!!pending}
        >
          <Icon name="book" size={23} />
          <span>나의 기록</span>
        </button>
      </nav>
      {/* 모달은 같은 화면의 맨 끝에 두며, 부모의 상태가 열고 닫을 창을 결정합니다. */}
      <MemoryDialog
        state={dialog}
        onClose={() => setDialog(null)}
        busy={!!pending}
        onDelete={deleteMemory}
        error={error}
      />
      {photoViewer && <PhotoViewer photos={photoViewer.photos} initialIndex={photoViewer.index} onClose={() => setPhotoViewer(null)} />}
    </div>
  );
}
