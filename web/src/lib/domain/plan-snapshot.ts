import type { Equipment, Exercise, PlanSnapshot, Template, TemplateItem } from '../types.js'

/** Captura tudo que dá significado ao plano no instante em que a sessão começa. */
export function capturePlanSnapshot(
  template: Template,
  items: TemplateItem[],
  exercises: Exercise[],
  equipment: Equipment[],
  capturedAt = new Date().toISOString(),
): PlanSnapshot {
  const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]))
  const equipmentById = new Map(equipment.map((item) => [item.id, item]))

  return {
    version: 1,
    capturedAt,
    templateId: template.id,
    templateName: template.name,
    items: items.map((item) => {
      const exercise = exerciseById.get(item.exerciseId)
      if (!exercise) throw new Error(`Exercício ${item.exerciseId} não encontrado ao iniciar a sessão`)
      const gear = exercise.equipmentId ? equipmentById.get(exercise.equipmentId) ?? null : null
      return {
        ...item,
        exerciseName: exercise.name,
        laterality: exercise.laterality,
        unilateralAsymmetric: exercise.unilateralAsymmetric,
        loadPerSide: exercise.loadPerSide,
        equipment: gear ? {
          id: gear.id, name: gear.name, loadType: gear.loadType,
          incrementKg: gear.incrementKg, plateTable: [...gear.plateTable],
        } : null,
      }
    }),
  }
}
