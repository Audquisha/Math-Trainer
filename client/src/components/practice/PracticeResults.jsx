export default function PracticeResults({ results }) {
  return (
    <ol className="list-inside list-decimal">
      {results.map((result, index) => (
        <li key={index}>
          {result.prompt} Answer: {result.correctAnswer}.{' '}
          {result.timedOut ? 'Time expired.' : result.selectedAnswer === null ? 'Not answered.' : `Your answer: ${result.selectedAnswer}.`}{' '}
          {result.isCorrect ? 'Correct.' : 'Incorrect.'}
        </li>
      ))}
    </ol>
  )
}
