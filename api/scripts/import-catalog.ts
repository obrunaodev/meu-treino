import { readFile } from 'node:fs/promises'
import { db, pool } from '../src/db/index.js'
import {
  catalogExercises, catalogGroups, catalogPainSwaps, catalogRelated, catalogStations, painRegions,
} from '../src/db/schema.js'
import { logger } from '../src/lib/logger.js'

const SOURCE = process.env.CATALOG_PATH ?? './catalogo-enriquecido.json'

/**
 * 206 das 295 descrições em pt e 4 nomes chegaram com UTF-8 lido como latin-1
 * ("deixe os pÃ©s"). Reverter é seguro: só mexe no que tem o padrão, e o texto
 * já correto não sobrevive a um round-trip por latin-1 sem erro.
 */
function fixMojibake(text: string): string {
  if (!/[ÃÂ][\x80-\xBF]/.test(text)) return text
  try {
    return Buffer.from(text, 'latin1').toString('utf8')
  } catch {
    return text
  }
}

/**
 * O catálogo guarda os nomes em caixa alta ("LEG PRESS HORIZONTAL"). Em caixa
 * alta eles não cabem nas listas nem combinam com o resto da interface, então
 * viram sentença — a primeira letra maiúscula e o resto minúsculo, o que
 * preserva números e siglas curtas sem precisar de dicionário.
 */
function toSentenceCase(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) return trimmed
  // Já tem minúscula: a origem cuidou do caso, não mexer.
  if (/[a-zà-ÿ]/.test(trimmed)) return trimmed
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase()
}

function fixI18n(record: Record<string, string> | undefined): Record<string, string> {
  if (!record) return {}
  return Object.fromEntries(Object.entries(record).map(([k, v]) => [k, fixMojibake(v)]))
}

type RawExercise = {
  id: number
  nome: string
  slug: string
  nome_i18n?: Record<string, string>
  grupo: { id: number; slug: string; nome: string; regiao: string | null }
  equipamento: {
    codigo_estacao: string | null
    nome: string | null
    categoria: string | null
    tipo_carga: string | null
    carga_inferida: boolean
  }
  execucao: { nivel: string | null; lateralidade: string | null; pegada: string | null }
  descricao: Record<string, string>
  video: Record<string, string>
  contraindicacoes: Array<{ slug: string; nome: string; confianca: string }>
  relacionados?: number[]
  exclui: number[]
}

/**
 * 12 regiões com lado na UI, mapeadas para as 4 sem lado que o catálogo usa.
 * Dor no joelho direito ativa as contraindicações de `joelho` genérico — o
 * catálogo não distingue lado, e inventar essa distinção seria falsa precisão.
 */
const PAIN_REGIONS = [
  { slug: 'cervical', namePt: 'Cervical', nameEn: 'Neck', side: null, catalogSlug: 'cervical' },
  { slug: 'ombro_d', namePt: 'Ombro direito', nameEn: 'Right shoulder', side: 'D', catalogSlug: 'ombro' },
  { slug: 'ombro_e', namePt: 'Ombro esquerdo', nameEn: 'Left shoulder', side: 'E', catalogSlug: 'ombro' },
  { slug: 'cotovelo_d', namePt: 'Cotovelo direito', nameEn: 'Right elbow', side: 'D', catalogSlug: null },
  { slug: 'cotovelo_e', namePt: 'Cotovelo esquerdo', nameEn: 'Left elbow', side: 'E', catalogSlug: null },
  { slug: 'lombar', namePt: 'Lombar', nameEn: 'Lower back', side: null, catalogSlug: 'lombar' },
  { slug: 'quadril_d', namePt: 'Quadril direito', nameEn: 'Right hip', side: 'D', catalogSlug: 'quadril' },
  { slug: 'quadril_e', namePt: 'Quadril esquerdo', nameEn: 'Left hip', side: 'E', catalogSlug: 'quadril' },
  { slug: 'joelho_d', namePt: 'Joelho direito', nameEn: 'Right knee', side: 'D', catalogSlug: 'joelho' },
  { slug: 'joelho_e', namePt: 'Joelho esquerdo', nameEn: 'Left knee', side: 'E', catalogSlug: 'joelho' },
  { slug: 'tornozelo_d', namePt: 'Tornozelo direito', nameEn: 'Right ankle', side: 'D', catalogSlug: null },
  { slug: 'tornozelo_e', namePt: 'Tornozelo esquerdo', nameEn: 'Left ankle', side: 'E', catalogSlug: null },
]

/**
 * O campo bruto `exclui` (`exercicio_exclusao`) guarda o exercício SUBSTITUTO
 * quando a dor de `contraindicacoes` está presente — o nome engana.
 *
 * A qualidade da origem não é uniforme: ombro e lombar batem em ~100%, joelho e
 * quadril apontam para alvo inexistente (id 41) ou para um exercício com a
 * MESMA dor em ~80%. Importamos tudo, mas com `status` para que o app só
 * ofereça automaticamente o que passou na triagem.
 */
function triageSwap(
  exercise: RawExercise,
  painSlug: string,
  byId: Map<number, RawExercise>,
): { substituteId: number | null; status: string; note: string | null } {
  const targetId = exercise.exclui[0]
  if (targetId === undefined) return { substituteId: null, status: 'pendente', note: 'sem substituto na origem' }

  const target = byId.get(targetId)
  if (!target) {
    return { substituteId: null, status: 'invalido', note: `alvo ${targetId} não existe no catálogo` }
  }
  if (target.contraindicacoes.some((c) => c.slug === painSlug)) {
    return {
      substituteId: targetId,
      status: 'invalido',
      note: `alvo também é contraindicado para ${painSlug}`,
    }
  }
  return { substituteId: targetId, status: 'ok', note: null }
}

async function main() {
  const raw = JSON.parse(await readFile(SOURCE, 'utf8')) as {
    lookups: {
      grupos: Record<string, { slug: string; nome: string; regiao: string | null }>
      estacoes: Record<string, { nome: string; tipo_carga: string; categoria: string }>
    }
    exercicios: RawExercise[]
  }

  const byId = new Map(raw.exercicios.map((e) => [e.id, e]))

  await db.insert(painRegions).values(PAIN_REGIONS).onConflictDoNothing()

  const groups = Object.entries(raw.lookups.grupos).map(([id, g]) => ({
    id: Number(id),
    slug: g.slug,
    name: fixMojibake(g.nome),
    region: g.regiao,
  }))
  await db.insert(catalogGroups).values(groups).onConflictDoNothing()

  const stations = Object.entries(raw.lookups.estacoes).map(([code, s]) => ({
    code: code.padStart(2, '0'),
    name: toSentenceCase(fixMojibake(s.nome)),
    category: s.categoria ?? null,
    loadType: s.tipo_carga ?? null,
  }))
  for (const station of stations) {
    await db
      .insert(catalogStations)
      .values(station)
      .onConflictDoUpdate({ target: catalogStations.code, set: { name: station.name } })
  }

  const knownStations = new Set(stations.map((s) => s.code))

  const exercises = raw.exercicios.map((e) => {
    const code = e.equipamento.codigo_estacao?.padStart(2, '0') ?? null
    return {
      id: e.id,
      name: toSentenceCase(fixMojibake(e.nome)),
      slug: e.slug,
      nameI18n: fixI18n(e.nome_i18n),
      groupId: e.grupo?.id ?? null,
      stationCode: code && knownStations.has(code) ? code : null,
      level: e.execucao?.nivel ?? null,
      laterality: e.execucao?.lateralidade ?? null,
      grip: e.execucao?.pegada ?? null,
      description: fixI18n(e.descricao),
      video: e.video ?? {},
      loadType: e.equipamento?.tipo_carga ?? null,
      loadInferred: e.equipamento?.carga_inferida ?? false,
    }
  })
  // onConflictDoUpdate e não DoNothing: reimportar precisa corrigir nomes e
  // descrições de uma base já carregada, senão o mojibake ficaria para sempre.
  for (const exercise of exercises) {
    await db
      .insert(catalogExercises)
      .values(exercise)
      .onConflictDoUpdate({
        target: catalogExercises.id,
        set: {
          name: exercise.name,
          nameI18n: exercise.nameI18n,
          description: exercise.description,
          video: exercise.video,
        },
      })
  }

  const related = raw.exercicios.flatMap((e) =>
    (e.relacionados ?? []).filter((r) => byId.has(r)).map((r) => ({ exerciseId: e.id, relatedId: r })),
  )
  if (related.length) await db.insert(catalogRelated).values(related).onConflictDoNothing()

  const swaps = []
  const tally: Record<string, Record<string, number>> = {}

  for (const exercise of raw.exercicios) {
    for (const contra of exercise.contraindicacoes) {
      const verdict = triageSwap(exercise, contra.slug, byId)
      swaps.push({
        exerciseId: exercise.id,
        painSlug: contra.slug,
        substituteId: verdict.substituteId,
        source: 'academia',
        status: verdict.status,
        note: verdict.note,
      })
      tally[contra.slug] ??= {}
      tally[contra.slug]![verdict.status] = (tally[contra.slug]![verdict.status] ?? 0) + 1
    }
  }
  if (swaps.length) await db.insert(catalogPainSwaps).values(swaps).onConflictDoNothing()

  logger.info(
    {
      grupos: groups.length,
      estacoes: stations.length,
      exercicios: exercises.length,
      relacionados: related.length,
      substituicoes: swaps.length,
      triagem: tally,
    },
    'catálogo importado',
  )
  await pool.end()
}

main().catch((err) => {
  logger.error(err, 'falha na importação do catálogo')
  process.exit(1)
})
