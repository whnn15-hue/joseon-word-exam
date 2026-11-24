# 조선 시대 낱말 쓰기 시험

5학년 사회 조선 시대 낱말 49문제 주관식 시험 웹앱 (Netlify Functions + Netlify Blobs)

- `/` 학생 시험 화면: 번호와 이름 입력, 힌트 없음, 한 번만 제출
- `/teacher.html` 선생님 결과 화면: 학생별 점수, 답안, 문항별 정답률, 시험 열기/닫기, 점수 공개 여부, 재응시 허용, CSV 내려받기
- 정답은 `lib/questions.mjs`에만 있고 서버에서 채점

## 설정
- Netlify 환경 변수 `TEACHER_PASSWORD`: 선생님 화면 비밀번호
- Netlify 프로젝트의 Visitor access(팀 로그인 보호)는 꺼야 학생이 들어올 수 있음

## 사회 1단원 쪽지시험 (빈칸 65개)
- `/unit1/` 시험, `/unit1/practice.html` 연습(초성 힌트, 문단마다 두 번 기회), `/unit1/teacher.html` 결과
- 문제와 정답: `lib/unit1.mjs`, 서버: `netlify/functions/unit1.mts`
- 선생님 화면에서 시험 열기, 점수 공개, 연습하기 열기를 켜고 끌 수 있음 (시험 중에는 연습하기를 닫기)
