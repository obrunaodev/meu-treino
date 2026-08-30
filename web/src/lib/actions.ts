import { v7 as uuidv7 } from 'uuid'
import { useMemo } from 'react'
import { localDb, type SyncEntity } from './db.js'
import { mutate, remove } from './outbox.js'
import { useAuth } from './auth.js'
import type {
  CardioOption, CatalogStation, Equipment, Exercise, Program, SetLog, Template, TemplateItem, WorkoutSession,
} from './types.js'
import { capturePlanSnapshot } from './domain/plan-snapshot.js'

/**
 * Escritas de domínio. Ficam fora dos componentes porque quase toda ação toca
 * mais de uma entidade — criar o programa cria templates, academia e
 * equipamentos — e isso precisa ser uma coisa só, não espalhada por handlers.
 */

export interface ProgramDraft {
  name: string
  scheduleMode: 'continuous' | 'weekly'
  weekdays: number[]
  templateNames: string[]
  cyclesPerBlock: number
  rirDeltaPerBlock: number
  defaultRestSeconds: number
  reminderLeadMinutes: number
  remindersEnabled: boolean
  gymName: string
  stations: CatalogStation[]
  cardioNames: string[]
}

/** Exportado para os testes: as ações são puras em relação ao React. */
export function makeActions(ownerId: string) {
  const write = <T>(entity: SyncEntity, patch: Record<string, unknown>) =>
    mutate(entity, { ...patch, ownerId }) as Promise<T>

  return {
    /**
     * Onboarding: cria programa, os treinos do ciclo, a academia e um
     * equipamento por estação marcada. O `plateTable` nasce vazio de propósito
     * — o catálogo não sabe as placas desta unidade, e chutar seria pior que
     * pedir ao usuário na primeira vez que ele usar a máquina.
     */
    async createProgram(draft: ProgramDraft) {
      const gym = await write<{ id: string }>('gyms', { name: draft.gymName, isActive: true })

      for (const station of draft.stations) {
        await write('equipment', {
          gymId: gym.id,
          catalogStationCode: station.code,
          name: station.name,
          loadType: station.loadType ?? 'pino',
          plateTable: [],
          incrementKg: null,
        })
      }

      for (const name of draft.cardioNames) {
        await write('cardio_options', { gymId: gym.id, name, notes: null })
      }

      // Programa novo desativa o anterior: só um ciclo corre por vez.
      const previous = await localDb.table_('programs').toArray()
      for (const row of previous) {
        if (row.isActive) await mutate('programs', { id: row.id, ownerId, isActive: false })
      }

      const program = await write<Program>('programs', {
        name: draft.name,
        scheduleMode: draft.scheduleMode,
        weekdays: draft.weekdays,
        sessionsPerCycle: draft.templateNames.length,
        cyclesPerBlock: draft.cyclesPerBlock,
        rirDeltaPerBlock: draft.rirDeltaPerBlock,
        defaultRestSeconds: draft.defaultRestSeconds,
        reminderLeadMinutes: draft.reminderLeadMinutes,
        isActive: true,
        startedAt: new Date().toISOString(),
      })

      for (const [position, name] of draft.templateNames.entries()) {
        await write('templates', { programId: program.id, position, name, focus: null })
      }

      const settings = (await localDb.table_('user_settings').toArray())[0]
      await mutate('user_settings', {
        id: settings?.id,
        ownerId,
        remindersEnabled: draft.remindersEnabled,
        onboardedAt: new Date().toISOString(),
      })

      return program
    },

    updateProgram: (id: string, patch: Partial<Program>) =>
      mutate('programs', { ...patch, id, ownerId }),

    saveEquipment: (patch: Partial<Equipment> & { id?: string }) =>
      write<Equipment>('equipment', patch as Record<string, unknown>),

    removeEquipment: (id: string) => remove('equipment', id),

    saveCardioOption: (patch: Partial<CardioOption> & { id?: string }) =>
      write<CardioOption>('cardio_options', patch as Record<string, unknown>),

    async removeCardioOption(id: string) {
      const templates = await localDb.table_('templates').toArray()
      for (const template of templates) {
        if (template.cardioOptionId === id && !template.deletedAt) {
          await mutate('templates', { id: template.id, ownerId, cardioOptionId: null })
        }
      }
      await remove('cardio_options', id)
    },

    saveExercise: (patch: Partial<Exercise> & { id?: string }) =>
      write<Exercise>('exercises', patch as Record<string, unknown>),

    /**
     * Apaga o exercício e o que só existe por causa dele.
     *
     * As séries já registradas ficam: o histórico é o que o app promete
     * guardar, e apagar o exercício não desfaz o treino que foi feito — a tela
     * de sessão passa a mostrá-lo como removido. Já o item de treino some, ou a
     * próxima sessão abriria com uma linha apontando para nada.
     *
     * A substituição some pelas duas pontas: sobrar uma que aponta para um
     * exercício morto ofereceria uma troca impossível na hora da dor.
     */
    async deleteExercise(exerciseId: string) {
      const items = await localDb.table_('template_items').toArray()
      for (const item of items) {
        if (item.exerciseId === exerciseId && !item.deletedAt) await remove('template_items', item.id)
      }

      const media = await localDb.table_('exercise_media').toArray()
      for (const row of media) {
        if (row.exerciseId === exerciseId && !row.deletedAt) await remove('exercise_media', row.id)
      }

      const swaps = await localDb.table_('exercise_substitutions').toArray()
      for (const row of swaps) {
        const touches = row.exerciseId === exerciseId || row.substituteExerciseId === exerciseId
        if (touches && !row.deletedAt) await remove('exercise_substitutions', row.id)
      }

      await remove('exercises', exerciseId)
    },

    addSubstitution: (exerciseId: string, substituteExerciseId: string, reason: string, painRegion: string | null = null) =>
      write('exercise_substitutions', { exerciseId, substituteExerciseId, reason, painRegion }),

    removeSubstitution: (id: string) => remove('exercise_substitutions', id),

    saveTemplate: (patch: Partial<Template> & { id?: string }) =>
      write<Template>('templates', patch as Record<string, unknown>),

    /**
     * O tamanho do ciclo É a quantidade de treinos. Criar um treino sem mexer
     * em `sessionsPerCycle` faria a numeração de ciclo e a fronteira de bloco
     * derivarem em silêncio — os gráficos e a sugestão de RIR passariam a
     * contar errado sem nenhum erro visível.
     */
    async addTemplate(program: Program, name: string) {
      const siblings = (await localDb.table_('templates').toArray())
        .filter((row) => row.programId === program.id && !row.deletedAt)

      const template = await write<Template>('templates', {
        programId: program.id,
        position: siblings.length,
        name,
        focus: null,
      })

      await mutate('programs', {
        id: program.id,
        ownerId,
        sessionsPerCycle: siblings.length + 1,
      })

      return template
    },

    /**
     * Soft delete, e as posições dos que ficam são reescritas para não abrir
     * buraco no rodízio.
     *
     * O treino apagado continua no banco de propósito: sessões antigas apontam
     * para ele, e o histórico precisa saber o nome do que foi feito. Some da
     * lista, não da memória.
     */
    async deleteTemplate(program: Program, templateId: string) {
      const siblings = (await localDb.table_('templates').toArray())
        .filter((row) => row.programId === program.id && !row.deletedAt)
        .sort((a, b) => (a.position as number) - (b.position as number))

      // Ciclo sem nenhum treino não tem o que rodar; a UI também bloqueia.
      if (siblings.length <= 1) return false

      await remove('templates', templateId)

      const remaining = siblings.filter((row) => row.id !== templateId)
      for (const [position, row] of remaining.entries()) {
        if (row.position !== position) await mutate('templates', { id: row.id, ownerId, position })
      }

      await mutate('programs', {
        id: program.id,
        ownerId,
        sessionsPerCycle: remaining.length,
      })

      return true
    },

    /** A ordem dos treinos É a ordem do rodízio, então reordenar muda o ciclo. */
    async reorderTemplates(ids: string[]) {
      for (const [position, id] of ids.entries()) {
        await mutate('templates', { id, ownerId, position })
      }
    },

    saveTemplateItem: (patch: Partial<TemplateItem> & { id?: string }) =>
      write<TemplateItem>('template_items', patch as Record<string, unknown>),

    removeTemplateItem: (id: string) => remove('template_items', id),

    /** Reordena gravando a posição de todos: menos estados intermediários errados. */
    async reorderTemplateItems(ids: string[]) {
      for (const [position, id] of ids.entries()) {
        await mutate('template_items', { id, ownerId, position })
      }
    },

    async startSession(programId: string, templateId: string, cycleNumber: number, blockNumber: number) {
      const [template, allItems, exercises, equipment] = await Promise.all([
        localDb.table_('templates').get(templateId),
        localDb.table_('template_items').toArray(),
        localDb.table_('exercises').toArray(),
        localDb.table_('equipment').toArray(),
      ])
      if (!template || template.deletedAt) throw new Error('Treino não encontrado ao iniciar a sessão')
      const items = allItems
        .filter((item) => item.templateId === templateId && !item.deletedAt)
        .sort((a, b) => Number(a.position) - Number(b.position))
      const planSnapshot = capturePlanSnapshot(
        template as unknown as Template,
        items as unknown as TemplateItem[],
        exercises.filter((row) => !row.deletedAt) as unknown as Exercise[],
        equipment.filter((row) => !row.deletedAt) as unknown as Equipment[],
      )
      return write<WorkoutSession>('workout_sessions', {
        programId,
        templateId,
        planSnapshot,
        cycleNumber,
        blockNumber,
        status: 'em_andamento',
        startedAt: new Date().toISOString(),
      })
    },

    updateSession: (id: string, patch: Partial<WorkoutSession>) =>
      mutate('workout_sessions', { ...patch, id, ownerId }),

    /**
     * Apaga a sessão e tudo que pendura nela.
     *
     * Sem a cascata, séries e cardio de uma sessão apagada continuariam vivos:
     * apareceriam no export CSV e no volume por ciclo, presos a uma sessão que
     * não existe mais. Soft delete em todos, para o servidor receber a remoção.
     */
    async deleteSession(sessionId: string) {
      for (const entity of ['set_logs', 'cardio_logs', 'pain_events'] as const) {
        const rows = await localDb.table_(entity).toArray()
        for (const row of rows) {
          if (row.sessionId === sessionId && !row.deletedAt) await remove(entity, row.id)
        }
      }
      await remove('workout_sessions', sessionId)
    },

    updateCardio: (id: string, patch: Record<string, unknown>) =>
      mutate('cardio_logs', { ...patch, id, ownerId }),

    removeCardio: (id: string) => remove('cardio_logs', id),

    logSet: (patch: Partial<SetLog>) =>
      write<SetLog>('set_logs', {
        side: 'ambos',
        isWarmup: false,
        skipped: false,
        hadPain: false,
        completedAt: new Date().toISOString(),
        ...patch,
      }),

    updateSet: (id: string, patch: Partial<SetLog>) => mutate('set_logs', { ...patch, id, ownerId }),

    removeSet: (id: string) => remove('set_logs', id),

    logCardio: (patch: Record<string, unknown>) => write('cardio_logs', patch),

    logPain: (patch: { regionSlug: string; level: number; sessionId?: string | null; setLogId?: string | null; note?: string | null }) =>
      write('pain_events', { occurredAt: new Date().toISOString(), ...patch }),

    removePain: (id: string) => remove('pain_events', id),

    saveTest: (patch: Record<string, unknown> & { id?: string }) => write('functional_tests', patch),
    removeTest: (id: string) => remove('functional_tests', id),

    saveTestResult: (patch: Record<string, unknown>) =>
      write('test_results', { measuredAt: new Date().toISOString(), side: 'ambos', ...patch }),

    removeTestResult: (id: string) => remove('test_results', id),

    async saveSettings(patch: Record<string, unknown>) {
      const settings = (await localDb.table_('user_settings').toArray())[0]
      return mutate('user_settings', { ...patch, id: settings?.id, ownerId })
    },

    /** Fila local de imagens: a foto tirada na academia sobe quando houver rede. */
    async queueUpload(exerciseId: string, blob: Blob, filename: string) {
      await localDb.transaction('rw', localDb.uploads, async () => {
        // Só a escolha mais recente precisa subir quando várias fotos forem
        // feitas offline para o mesmo exercício.
        await localDb.uploads.where('exerciseId').equals(exerciseId).delete()
        await localDb.uploads.put({
          id: uuidv7(),
          exerciseId,
          blob,
          filename,
          queuedAt: new Date().toISOString(),
        })
      })
    },
  }
}

export type Actions = ReturnType<typeof makeActions>

export function useActions(): Actions {
  const { user } = useAuth()
  const ownerId = user?.id ?? ''
  return useMemo(() => makeActions(ownerId), [ownerId])
}
