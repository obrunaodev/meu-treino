import { describe, expect, it } from 'vitest'
import { helpMessage, lastWorkoutMessage, todayMessage, weeklyHistoryMessage, workoutMessage } from '../src/messages.js'
import type { ActiveWorkout, WorkoutItem } from '../src/workout.js'
import type { WorkoutReview } from '../src/workout-history.js'

const item = (patch: Partial<WorkoutItem> = {}): WorkoutItem => ({
  id: 'item', exerciseId: 'exercise', name: 'Leg press', position: 0,
  sets: 3, repMin: 10, repMax: 15, rirTarget: 2, loadPerSide: false,
  previousWeightKg: 100, videoUrl: 'https://youtu.be/exemplo', ...patch,
})

describe('helpMessage', () => {
  it('mostra somente comandos válidos quando não há sessão aberta', () => {
    const message = helpMessage(null)

    expect(message).toContain('/start')
    expect(message).toContain('/edit')
    expect(message).toContain('/help')
    expect(message).toContain('/clear')
    expect(message).toContain('/history')
    expect(message).toContain('/today')
    expect(message).toContain('/last')
    expect(message).toContain('/ultimo')
    expect(message).not.toContain('/end')
    expect(message).not.toContain('/skip')
  })

  it('mostra estágio, próximo exercício e comandos da sessão', () => {
    const review: WorkoutReview = {
      sessionId: 'session', templateName: 'Treino B', status: 'em_andamento',
      startedAt: new Date('2026-08-23T12:30:00Z'),
      items: [
        { id: '1', exerciseId: 'e1', name: 'Supino', skipped: false, weightKg: 80, sets: 3, reps: 10, rir: 2 },
        { id: '2', exerciseId: 'e2', name: 'Remada', skipped: false, weightKg: null, sets: 0, reps: null, rir: null },
      ],
    }
    const message = helpMessage(review)

    expect(message).toContain('1/2 exercícios resolvidos')
    expect(message).toContain('*Supino* — 3 séries · 10 reps · 80 kg · Moderado')
    expect(message).toContain('Próximo: *2. Remada*')
    expect(message).toContain('/skip')
    expect(message).toContain('/end')
    expect(message).toContain('/clear')
    expect(message).toContain('/history')
    expect(message).toContain('/today')
    expect(message).toContain('/edit')
  })

  it('mostra a data da sessão no resumo de edição', async () => {
    const review: WorkoutReview = {
      sessionId: 'session', templateName: 'Treino A', status: 'concluida',
      startedAt: new Date('2026-08-23T12:30:00Z'), items: [],
    }
    const { editReviewMessage } = await import('../src/messages.js')
    const message = editReviewMessage(review)

    expect(message).toContain('23/08/2026')
    expect(message).toContain('09:30')
  })

  it('mostra o treino mais recente e seus valores sem alterá-lo', () => {
    const review: WorkoutReview = {
      sessionId: 'session', templateName: 'Treino A', status: 'concluida',
      startedAt: new Date('2026-08-23T12:30:00Z'),
      items: [{ id: '1', exerciseId: 'e1', name: 'Supino', skipped: false, weightKg: 80, sets: 3, reps: 10, rir: 2 }],
    }
    const message = lastWorkoutMessage(review)

    expect(message).toContain('ÚLTIMO TREINO · TREINO A')
    expect(message).toContain('23/08/2026')
    expect(message).toContain('*Supino* — 3 séries · 10 reps · 80 kg · Moderado')
    expect(message).toContain('/edit 1 70kg 3x15 moderado')
  })
})

describe('weeklyHistoryMessage', () => {
  it('resume sessões, volume e duração da semana', () => {
    const message = weeklyHistoryMessage([{
      id: 'session', templateName: 'Treino A', status: 'concluida',
      startedAt: new Date('2026-08-23T12:00:00Z'), endedAt: new Date('2026-08-23T13:05:00Z'),
      exercises: 6, sets: 18, volumeKg: 12_500,
    }])

    expect(message).toContain('HISTÓRICO DA SEMANA')
    expect(message).toContain('1/1 concluídos')
    expect(message).toContain('Treino A')
    expect(message).toContain('6 exercícios · 18 séries')
    expect(message).toContain('12.500 kg de volume')
    expect(message).toContain('65 min')
  })

  it('informa quando a semana está vazia', () => {
    expect(weeklyHistoryMessage([])).toContain('Nenhum treino registrado')
  })
})

const workout = (items: WorkoutItem[]): ActiveWorkout => ({
  sessionId: 'session', templateName: 'Treino A', items,
})

describe('workoutMessage', () => {
  it('omite vídeo por padrão e inclui quando solicitado', () => {
    const message = workoutMessage(workout([item()]))
    const withLinks = workoutMessage(workout([item()]), { includeLinks: true })

    expect(message).toContain('1. *Leg press* · 3×10–15 · Moderado · Carga: 100 kg')
    expect(message).not.toContain('youtu.be/exemplo')
    expect(withLinks).toContain('1. *Leg press* · 3×10–15 · Moderado · Carga: 100 kg\n   Link: https://youtu.be/exemplo')
    expect(message).toContain('Pular: `/skip 1`')
  })

  it('deixa claro que /today não iniciou uma sessão', () => {
    const message = todayMessage({ ...workout([item()]), alreadyStarted: false })

    expect(message).toContain('Apenas prévia')
    expect(message).toContain('nenhuma sessão foi iniciada')
    expect(message).toContain('/start')
  })

  it('mostra o estado da sessão em andamento no /today', () => {
    const review: WorkoutReview = {
      sessionId: 'session', templateName: 'Treino A', status: 'em_andamento',
      startedAt: new Date('2026-08-23T12:30:00Z'),
      items: [
        { id: '1', exerciseId: 'e1', name: 'Leg press', skipped: false, weightKg: 100, sets: 3, reps: 12, rir: 2 },
        { id: '2', exerciseId: 'e2', name: 'Extensora', skipped: true, weightKg: null, sets: 0, reps: null, rir: null },
        { id: '3', exerciseId: 'e3', name: 'Flexora', skipped: false, weightKg: null, sets: 0, reps: null, rir: null },
      ],
    }
    const message = todayMessage({ ...workout([item()]), alreadyStarted: true }, {}, review)

    expect(message).toContain('Esta sessão já está em andamento')
    expect(message).toContain('ESTADO ATUAL · 2/3 resolvidos')
    expect(message).toContain('Próximo: *3. Flexora*')
    expect(message).toContain('*Leg press* — 3 séries · 12 reps · 100 kg · Moderado')
    expect(message).toContain('*Extensora* · pulado')
    expect(message).toContain('*Flexora* · pendente')
    expect(message).not.toContain('Para iniciar')
  })

  it('marca carga por lado e não inventa carga sem histórico', () => {
    const message = workoutMessage(workout([
      item({ previousWeightKg: 40, loadPerSide: true }),
      item({ id: 'second', previousWeightKg: null, videoUrl: null }),
    ]))

    expect(message).toContain('Carga: 40 kg/lado')
    expect(message).toContain('Carga: definir')
  })
})
