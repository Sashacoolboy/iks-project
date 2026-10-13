// Спільний висновок — один текст, який може охоплювати декілька ODP (result.conclusion_id → assessment.conclusions[])
function assertMutable(assessment) {
  if (assessment.status === 'FINALIZED') throw new Error('оцінювання фіналізовано — зміни заборонені');
}

export function nextConclusionId(assessment) {
  const nums = (assessment.conclusions ?? []).map(c => Number(c.conclusion_id?.match(/^CN-(\d+)$/)?.[1] ?? 0));
  return `CN-${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, '0')}`;
}

// ODP (assessment_source_id), які зараз використовують цей спільний висновок
export function sourcesForConclusion(assessment, conclusionId) {
  return (assessment.results ?? []).filter(r => r.conclusion_id === conclusionId).map(r => r.assessment_source_id);
}

// Текст висновку для показу в таблиці/звіті: зі спільного запису, або legacy result.conclusion
export function conclusionTextFor(assessment, result) {
  if (!result) return '';
  if (result.conclusion_id) {
    const c = (assessment.conclusions ?? []).find(c => c.conclusion_id === result.conclusion_id);
    return c?.text ?? '';
  }
  return result.conclusion ?? '';
}

function removeIfOrphaned(assessment, conclusionId) {
  if (sourcesForConclusion(assessment, conclusionId).length) return assessment;
  return { ...assessment, conclusions: (assessment.conclusions ?? []).filter(c => c.conclusion_id !== conclusionId) };
}

// Зберегти текст для sourceId: створює спільний висновок, якщо його ще нема, інакше оновлює текст
// (торкається усіх ODP, що вже використовують цей самий висновок). Порожній текст без інших
// пов'язаних ODP прибирає висновок повністю, а не лишає порожній запис.
export function setConclusionText(assessment, sourceId, text) {
  assertMutable(assessment);
  const i = (assessment.results ?? []).findIndex(r => r.assessment_source_id === sourceId);
  if (i === -1) throw new Error(`результат не знайдено: ${sourceId}`);
  const existingId = assessment.results[i].conclusion_id;
  const trimmed = text.trim();

  if (existingId) {
    const others = sourcesForConclusion(assessment, existingId).filter(id => id !== sourceId);
    if (!trimmed && !others.length) {
      const results = assessment.results.slice();
      results[i] = { ...results[i], conclusion_id: null };
      const conclusions = (assessment.conclusions ?? []).filter(c => c.conclusion_id !== existingId);
      return { assessment: { ...assessment, results, conclusions, updated_at: new Date().toISOString() }, conclusion_id: null };
    }
    const conclusions = (assessment.conclusions ?? []).map(c => c.conclusion_id === existingId ? { ...c, text } : c);
    return { assessment: { ...assessment, conclusions, updated_at: new Date().toISOString() }, conclusion_id: existingId };
  }

  if (!trimmed) return { assessment, conclusion_id: null };

  const conclusion_id = nextConclusionId(assessment);
  const results = assessment.results.slice();
  results[i] = { ...results[i], conclusion_id };
  const conclusions = [...(assessment.conclusions ?? []), { conclusion_id, text }];
  return { assessment: { ...assessment, results, conclusions, updated_at: new Date().toISOString() }, conclusion_id };
}

// Долучити інший ODP (targetSourceId) до вже наявного спільного висновку
export function linkSource(assessment, conclusionId, targetSourceId) {
  assertMutable(assessment);
  if (!(assessment.conclusions ?? []).some(c => c.conclusion_id === conclusionId))
    throw new Error(`висновок не знайдено: ${conclusionId}`);
  const i = (assessment.results ?? []).findIndex(r => r.assessment_source_id === targetSourceId);
  if (i === -1) throw new Error(`результат не знайдено: ${targetSourceId}`);
  const prevId = assessment.results[i].conclusion_id;
  const results = assessment.results.slice();
  results[i] = { ...results[i], conclusion_id: conclusionId };
  let next = { ...assessment, results, updated_at: new Date().toISOString() };
  if (prevId && prevId !== conclusionId) next = removeIfOrphaned(next, prevId);
  return { assessment: next };
}

// Відв'язати ODP від спільного висновку (якщо це був останній — запис висновку видаляється)
export function unlinkSource(assessment, sourceId) {
  assertMutable(assessment);
  const i = (assessment.results ?? []).findIndex(r => r.assessment_source_id === sourceId);
  if (i === -1) throw new Error(`результат не знайдено: ${sourceId}`);
  const conclusionId = assessment.results[i].conclusion_id;
  const results = assessment.results.slice();
  results[i] = { ...results[i], conclusion_id: null };
  let next = { ...assessment, results, updated_at: new Date().toISOString() };
  if (conclusionId) next = removeIfOrphaned(next, conclusionId);
  return { assessment: next };
}
