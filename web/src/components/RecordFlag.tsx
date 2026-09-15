import { useTranslation } from 'react-i18next'
import type { RecordKind } from '../lib/domain/records.js'

/** Recorde sempre escrito, nunca só cor: o verde de "bom" acompanha a palavra. */
export function RecordFlag({ kinds }: { kinds: RecordKind[] | undefined }) {
  const { t } = useTranslation()
  if (!kinds?.length) return null
  return (
    <span className="record-flag" role="status">
      {t('records.new', { kinds: kinds.map((kind) => t(`records.kind_${kind}`)).join(' · ') })}
    </span>
  )
}
