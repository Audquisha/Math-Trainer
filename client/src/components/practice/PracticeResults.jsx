export default function PracticeResults({ results }) {
  return (
    <ol className="list-inside list-decimal">
      {results.map((result, index) => (
        <li key={index}>
          {result.factor1} × {result.factor2} = {result.correctAnswer}.{' '}
          {result.timedOut ? 'Time expired.' : `Your answer: ${result.selectedAnswer}.`}{' '}
          {result.isCorrect ? 'Correct.' : 'Incorrect.'}
        </li>
      ))}
    </ol>
  )
}
