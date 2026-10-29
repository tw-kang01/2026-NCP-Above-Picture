/**
 * 서버에 보관된 질문·답변 원문을 접었다 펼쳐 읽는 표시 전용 컴포넌트입니다.
 * 완성된 본문과 원문 대화는 별도 데이터이므로 본문을 고쳐도 여기의 내용은 바뀌지 않습니다.
 * turns는 질문 순서대로 정렬된 배열이며, 없으면 빈 배열로 처리합니다.
 */
/** 질문마다 실제 답변·건너뜀·미답변을 구분해 표시하고, 대화가 없으면 아무것도 그리지 않습니다. */
export default function ConversationHistory({ turns = [] }) {
  if (!turns.length) return null;
  return (
    <details className="conversation-history">
      {/* details/summary는 브라우저 기본 기능으로 펼침 상태와 키보드 조작을 함께 제공합니다. */}
      <summary>
        <span>질문과 내 답변</span>
        <span className="history-count">{turns.length}개의 질문 · 원문 보기</span>
      </summary>
      <p className="history-help">기억을 꺼내며 나눈 대화예요. 기록 본문을 고쳐도 이 원문은 그대로 보관돼요.</p>
      <ol className="history-turns">
        {turns.map((turn, index) => (
          <li key={turn.id}>
            <div className="history-question-label">
              질문 {index + 1}
              {turn.questionSource === "guided" && <span>준비된 질문</span>}
            </div>
            <p className="history-question">{turn.question}</p>
            {/* null은 아직 답하지 않음을 뜻하고, skipped는 사용자가 명시적으로 건너뛴 경우입니다. */}
            <div className={`history-answer ${turn.skipped || turn.answer === null ? "unanswered" : ""}`}>
              {turn.skipped ? "건너뛴 질문이에요." : turn.answer === null ? "답변하지 않고 기록을 완성했어요." : turn.answer}
            </div>
          </li>
        ))}
      </ol>
    </details>
  );
}
