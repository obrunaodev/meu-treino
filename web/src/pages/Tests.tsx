import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useFunctionalTests, useTestResults } from '../lib/repo.js'
import { useActions } from '../lib/actions.js'
import { Card, Empty } from '../components/ui.js'
import { LineChart } from '../components/charts.js'
import type { FunctionalTest } from '../lib/types.js'

export function Tests() {
  const { t } = useTranslation()
  const tests = useFunctionalTests()
  const { saveTest } = useActions()
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState({ name: '', unit: '', frequencyDays: 14, higherIsBetter: true })

  return (
    <div className="page">
      <div className="page__head">
        <h1>{t('tests.title')}</h1>
        <button type="button" className="button button--primary" onClick={() => setCreating((v) => !v)}>
          {t('tests.add')}
        </button>
      </div>

      {creating && (
        <Card>
          <label className="field">
            {t('tests.name')}
            <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </label>
          <label className="field">
            {t('tests.unit')}
            <input value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })} />
          </label>
          <label className="field">
            {t('tests.frequency')}
            <input
              type="number"
              min={1}
              value={draft.frequencyDays}
              onChange={(e) => setDraft({ ...draft, frequencyDays: Math.max(1, Number(e.target.value)) })}
            />
          </label>
          <label className="field field--inline">
            <input
              type="checkbox"
              checked={draft.higherIsBetter}
              onChange={(e) => setDraft({ ...draft, higherIsBetter: e.target.checked })}
            />
            {t('tests.higher_better')}
          </label>
          <button
            type="button"
            className="button button--primary"
            disabled={!draft.name.trim() || !draft.unit.trim()}
            onClick={async () => {
              await saveTest(draft)
              setDraft({ name: '', unit: '', frequencyDays: 14, higherIsBetter: true })
              setCreating(false)
            }}
          >
            {t('common.save')}
          </button>
        </Card>
      )}

      {tests.length === 0 ? <Empty message={t('tests.empty')} /> : tests.map((test) => (
        <TestCard key={test.id} test={test} />
      ))}
    </div>
  )
}

function TestCard({ test }: { test: FunctionalTest }) {
  const { t, i18n } = useTranslation()
  const results = useTestResults(test.id)
  const { saveTestResult, removeTest } = useActions()
  const [value, setValue] = useState('')

  const best = results.length
    ? results.reduce((a, b) => (test.higherIsBetter ? Math.max(a, b.value) : Math.min(a, b.value)),
        test.higherIsBetter ? -Infinity : Infinity)
    : null

  /** Dias até a próxima reaplicação, contados do último resultado. */
  const last = results.at(-1)
  const dueInDays = last
    ? Math.ceil(
        test.frequencyDays - (Date.now() - new Date(last.measuredAt).getTime()) / 86_400_000,
      )
    : 0

  const points = results.map((result) => ({
    label: new Date(result.measuredAt).toLocaleDateString(i18n.language, { day: '2-digit', month: 'short' }),
    value: result.value,
  }))

  return (
    <Card
      heading={test.name}
      action={
        <span className="mono muted">
          {dueInDays <= 0 ? t('tests.due') : t('tests.due_in', { days: dueInDays })}
        </span>
      }
    >
      {best !== null && Number.isFinite(best) && (
        <span className="mono muted">{t('tests.best', { value: `${best} ${test.unit}` })}</span>
      )}

      {points.length > 0 ? (
        <LineChart points={points} unit={test.unit} />
      ) : (
        <p className="muted">{t('tests.no_results')}</p>
      )}

      <form
        className="row"
        onSubmit={async (event) => {
          event.preventDefault()
          const parsed = Number(value)
          if (!Number.isFinite(parsed)) return
          await saveTestResult({ testId: test.id, value: parsed })
          setValue('')
        }}
      >
        <input
          className="grow"
          type="number"
          step="0.01"
          inputMode="decimal"
          placeholder={t('tests.value')}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <button type="submit" className="button button--quiet">{t('tests.record')}</button>
        <button type="button" className="button button--ghost" onClick={() => void removeTest(test.id)}>
          {t('common.delete')}
        </button>
      </form>
    </Card>
  )
}
