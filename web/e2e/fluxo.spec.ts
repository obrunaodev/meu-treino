import { expect, test, type Page } from '@playwright/test'

/**
 * Percurso de um usuário novo, do login à sessão registrada.
 *
 * Uma sequência num contexto de navegador só, de propósito: os passos
 * compartilham IndexedDB e sessão, exatamente como uma pessoa real usando o
 * app. Testes independentes aqui exigiriam semear estado por fora e deixariam
 * de exercitar o que importa — que o dado sobrevive de uma tela para a outra.
 */

const TOKEN = process.env.DEV_LOGIN_TOKEN ?? ''

test.describe.configure({ mode: 'serial' })

test.describe('jornada completa', () => {
  let page: Page
  const errors: string[] = []

  test.beforeAll(async ({ browser }) => {
    test.skip(!TOKEN, 'precisa de DEV_LOGIN_TOKEN e do login provisório ativo')

    page = await browser.newPage()
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      // O 401 do /auth/refresh inicial é esperado: navegador sem cookie ainda
      // não tem sessão, e é assim que o app descobre que precisa do login.
      if (message.type() === 'error' && !message.text().includes('401')) {
        errors.push(message.text())
      }
    })
  })

  test.afterAll(async () => {
    await page?.close()
  })

  test('entra com o acesso provisório', async () => {
    await page.goto('/')
    await page.getByLabel(/e-?mail/i).fill(`e2e-${Date.now()}@exemplo.com`)
    await page.getByLabel(/token/i).fill(TOKEN)
    await page.getByRole('button', { name: /^entrar$/i }).click()

    await expect(page.getByRole('heading', { name: /seu programa/i })).toBeVisible()
  })

  test('monta o programa no onboarding', async () => {
    await page.getByRole('button', { name: /continuar/i }).click()   // ritmo
    await page.getByRole('button', { name: /continuar/i }).click()   // ciclo
    await page.getByRole('button', { name: /continuar/i }).click()   // bloco
    await page.getByRole('button', { name: /continuar/i }).click()   // academia

    const stations = page.locator('.checkitem')
    await expect(stations.first()).toBeVisible({ timeout: 15_000 })
    await stations.nth(0).click()
    await stations.nth(1).click()
    await page.getByRole('button', { name: /esteira/i }).click()

    await page.getByRole('button', { name: /continuar/i }).click()   // lembretes
    await page.getByRole('button', { name: /criar meu programa/i }).click()

    await expect(page.getByRole('heading', { name: /^dashboard$/i })).toBeVisible()
  })

  test('importa um exercício do catálogo', async () => {
    await page.getByRole('link', { name: /^exercícios$/i }).first().click()
    await page.getByRole('button', { name: /importar do catálogo/i }).click()

    const items = page.locator('.checkitem')
    await expect(items.first()).toBeVisible({ timeout: 15_000 })
    await items.first().click()

    await expect(page.locator('.tile')).toHaveCount(1)
    const imageFilter = page.getByRole('group', { name: /filtrar exercícios por imagem/i })
    await imageFilter.getByRole('button', { name: /^com imagem$/i }).click()
    await expect(page.getByText(/nenhum exercício corresponde/i)).toBeVisible()
    await imageFilter.getByRole('button', { name: /^sem imagem$/i }).click()
    await expect(page.locator('.tile')).toHaveCount(1)
    await imageFilter.getByRole('button', { name: /^todos$/i }).click()
  })

  test('adiciona e apaga a imagem pelo detalhe do exercício', async () => {
    await page.locator('.tile').first().click()
    await page.locator('input[type="file"]').setInputFiles({
      name: 'exercise.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        'base64',
      ),
    })

    const removeImage = page.getByRole('button', { name: /apagar imagem do exercício/i })
    await expect(removeImage).toBeVisible({ timeout: 15_000 })
    await removeImage.click()
    await expect(removeImage).toHaveCount(0)
  })

  test('adiciona o exercício ao treino', async () => {
    await page.getByRole('link', { name: /gerenciar treinos/i }).first().click()
    await page.getByRole('button', { name: /adicionar exercício/i }).click()
    await page.locator('.checkitem').first().click()
    await page.getByLabel(/aparelho de cardio/i).selectOption({ label: 'Esteira' })

    await expect(page.locator('.item')).toHaveCount(1)
    await expect(page.getByLabel(/duração planejada/i)).toHaveValue('20')
  })

  test('inicia a sessão e conclui o exercício', async () => {
    await page.getByRole('link', { name: /treino de hoje/i }).first().click()
    await expect(page.getByRole('heading', { name: /treino de hoje/i })).toBeVisible()
    await page.getByRole('button', { name: /iniciar treino a/i }).click()

    await page.getByRole('button', { name: /começar exercícios/i }).click()
    await page.locator('.stepper').first().getByRole('button', { name: '+' }).click()
    await page.getByRole('checkbox', { name: /concluir/i }).first().click()

    await expect(page.getByText(/1 de 1 exercícios/i)).toBeVisible()
  })

  test('a sessão sobrevive a recarregar a página', async () => {
    await page.reload()

    // O estado vive no IndexedDB, não na memória do React: trocar para o app de
    // música e voltar não pode perder o exercício já registrado.
    await expect(page.getByRole('heading', { name: /treino de hoje/i })).toBeVisible()
    await expect(page.getByText(/1 de 1 exercícios/i)).toBeVisible()

    await page.setViewportSize({ width: 390, height: 844 })
    const rowsFitViewport = await page.locator('.loglist__row').evaluateAll((rows) => rows.every((row) => {
      const box = row.getBoundingClientRect()
      return box.left >= 0 && box.right <= document.documentElement.clientWidth
        && row.scrollWidth <= row.clientWidth
    }))
    expect(rowsFitViewport).toBe(true)
    const bottomClearance = await page.locator('.shell__main').evaluate((main) => {
      const tabs = document.querySelector<HTMLElement>('.shell__tabs')!
      return Number.parseFloat(getComputedStyle(main).paddingBottom) - tabs.getBoundingClientRect().height
    })
    expect(bottomClearance).toBeGreaterThanOrEqual(20)
  })

  test('encerra a sessão no cardio', async () => {
    await expect(page.getByRole('heading', { name: /cardio/i })).toBeVisible()
    await expect(page.getByLabel(/modalidade/i)).toHaveValue(/.+/)
    await page.getByRole('button', { name: /^moderado$/i }).click()
    await page.getByRole('button', { name: /encerrar sessão/i }).click()

    await expect(page.getByRole('heading', { name: /^dashboard$/i })).toBeVisible()
    await expect(page.locator('.dashboard__metric').filter({ hasText: /treinos na semana/i }).locator('strong')).toHaveText('1')
  })

  test('dashboard mantém a hierarquia no mobile e no desktop', async () => {
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(page.getByRole('heading', { name: /frequência de treino/i })).toBeVisible()
    await expect(page.getByRole('heading', { name: /evolução de carga/i })).toBeVisible()
    await expect(page.getByRole('heading', { name: /grupos musculares/i })).toBeVisible()
    await expect(page.getByRole('heading', { name: /histórico de dor/i })).toBeVisible()
    await expect(page.locator('.dashboard__analytics svg')).toHaveCount(3)
    await expect(page.getByLabel(/^exercício$/i)).toBeVisible()
    const volumeMetric = page.getByRole('button', { name: /^volume$/i })
    await volumeMetric.click()
    await expect(volumeMetric).toHaveClass(/pill--on/)
    await expect(page.locator('.dashboard__stats')).toHaveCSS('grid-template-columns', /.+ .+/)
    const mobileTabs = await page.locator('.shell__tabs').evaluate((tabs) => ({
      distribution: getComputedStyle(tabs).justifyContent,
      flexGrow: [...tabs.querySelectorAll<HTMLElement>('.shell__tab')]
        .map((tab) => getComputedStyle(tab).flexGrow),
    }))
    expect(mobileTabs.distribution).toBe('space-between')
    expect(mobileTabs.flexGrow).toEqual(['0', '0', '0', '0', '0'])
    const mobileActionFillsRow = await page.locator('.dashboard__next').evaluate((section) => {
      const button = section.querySelector<HTMLElement>('.button')!
      return Math.abs(button.getBoundingClientRect().width - section.clientWidth + 32) < 1
    })
    expect(mobileActionFillsRow).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)

    await page.setViewportSize({ width: 1280, height: 800 })
    const columns = (await page.locator('.dashboard__stats').evaluate((element) =>
      getComputedStyle(element).gridTemplateColumns.split(' ').length
    ))
    expect(columns).toBe(4)
    await expect(page.locator('.dashboard__analytics')).toHaveCSS('grid-template-columns', /.+ .+/)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1280)
    const graphOverflow = await page.locator('.dashboard__analytics .viz').evaluateAll((graphs) =>
      graphs.map((graph) => getComputedStyle(graph).overflow),
    )
    expect(graphOverflow.every((overflow) => overflow === 'clip')).toBe(true)
  })

  test('configuração do WhatsApp funciona em mobile e desktop', async () => {
    await page.getByRole('link', { name: /configurações/i }).first().click()
    await page.getByRole('link', { name: /^WhatsApp$/i }).click()
    await expect(page.getByRole('heading', { name: /^WhatsApp$/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /conectar WhatsApp/i })).toBeVisible()
    await expect(page.getByText('/start [--link]', { exact: true })).toBeVisible()

    await page.setViewportSize({ width: 390, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
    await page.setViewportSize({ width: 1280, height: 800 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1280)
  })

  test('iniciar em /session mostra a prévia e permite trocar', async () => {
    await page.getByRole('link', { name: /treino de hoje/i }).first().click()

    await expect(page.getByRole('heading', { name: /treino de hoje/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /escolher outro treino/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /iniciar treino b/i })).toBeVisible()

    await page.setViewportSize({ width: 390, height: 844 })
    const previewDoesNotOverlap = await page.locator('.session-preview__actions').evaluate((actions) => {
      const exerciseCard = document.querySelector<HTMLElement>('.session-preview > .card')!
      const actionBox = actions.getBoundingClientRect()
      const cardBox = exerciseCard.getBoundingClientRect()
      return getComputedStyle(actions).position === 'static' && actionBox.top >= cardBox.bottom
    })
    expect(previewDoesNotOverlap).toBe(true)

    await page.getByRole('button', { name: /escolher outro treino/i }).click()
    await expect(page.locator('.checkitem')).toHaveCount(2)
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await page.locator('.checkitem').filter({ hasText: /treino a/i }).click()
    await expect(page.getByRole('button', { name: /iniciar treino a/i })).toBeVisible()
    await page.setViewportSize({ width: 1280, height: 800 })
  })

  test('o histórico mostra a sessão concluída', async () => {
    await page.getByRole('link', { name: /histórico de treinos/i }).first().click()
    await expect(page.locator('.calendar__day--concluida')).toHaveCount(1)
  })

  test('exporta o CSV das séries', async () => {
    await page.getByRole('link', { name: /configurações/i }).first().click()

    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: /baixar csv/i }).click()
    const file = await download

    expect(file.suggestedFilename()).toBe('meu-treino-series.csv')
  })

  test('corrige uma série registrada no detalhe da sessão', async () => {
    await page.getByRole('link', { name: /histórico de treinos/i }).first().click()
    await page.locator('.calendar__day--concluida').click()

    await expect(page.getByRole('heading', { name: /treino a/i })).toBeVisible()
    await expect(page.locator('.page__title')).toContainText(/3 séries/i)

    // O primeiro exercício já vem aberto; subir a carga é o caso real de ter
    // registrado errado na academia.
    const linha = page.locator('.setrow').first()
    const antes = await linha.locator('.setrow__value').innerText()
    await linha.getByRole('button', { name: /carga \+/i }).click()
    await expect(linha.locator('.setrow__value')).not.toHaveText(antes)
  })

  test('marcar uma série como aquecimento tira ela do volume', async () => {
    // Começa da navegação, não do estado deixado pelo teste anterior: acoplar
    // um teste ao anterior torna a falha ilegível quando algo muda lá em cima.
    await page.getByRole('link', { name: /histórico de treinos/i }).first().click()
    await page.locator('.calendar__day--concluida').click()

    const primeira = page.locator('.setrow').first()
    await expect(primeira).toBeVisible()

    // click() e não check(): o checkbox é controlado por uma escrita
    // assíncrona no IndexedDB, e o check() re-clica enquanto o estado não
    // bate — ligando e desligando a série em loop até estourar o tempo.
    await primeira.getByRole('checkbox').first().click()
    await expect(primeira).toHaveClass(/setrow--warm/)

    // O contador do topo conta só séries de trabalho.
    await expect(page.locator('.page__title')).toContainText(/2 séries/i)
  })

  test('editar a carga por lado não reescreve a sessão antiga', async () => {
    // A sessão foi iniciada antes desta mudança. O histórico precisa manter
    // a configuração capturada naquela data, não a biblioteca de hoje.
    await page.getByRole('link', { name: /^exercícios$/i }).first().click()
    await page.locator('.tile').first().click()
    await page.getByRole('checkbox', { name: /carga por lado/i }).click()

    await page.getByRole('link', { name: /histórico de treinos/i }).first().click()
    await page.locator('.calendar__day--concluida').click()
    await expect(page.locator('.setrow__value').first()).not.toContainText('/lado')
  })

  test('o + exercício usa o plano capturado pela sessão', async () => {
    // Um exercício na biblioteca que NÃO está no Treino A.
    await page.getByRole('link', { name: /^exercícios$/i }).first().click()
    await page.getByRole('button', { name: /importar do catálogo/i }).click()
    const catalogo = page.locator('.checkitem')
    await expect(catalogo.first()).toBeVisible({ timeout: 15_000 })
    const forado = (await catalogo.nth(1).innerText()).split('\n')[0].trim()
    await catalogo.nth(1).click()
    await expect(page.locator('.tile')).toHaveCount(2)

    const abrirPicker = async () => {
      await page.getByRole('link', { name: /histórico de treinos/i }).first().click()
      await page.locator('.calendar__day--concluida').click()
      await page.getByRole('button', { name: /\+ exercício/i }).click()
    }

    // Fora do treino: não é oferecido, e como o único exercício previsto já tem
    // série, não sobra nada para oferecer.
    await abrirPicker()
    await expect(page.getByText(/já estão nesta sessão/i)).toBeVisible()
    await expect(page.getByText(forado, { exact: true })).toHaveCount(0)

    // Adicionar ao template hoje não muda o que a sessão antiga previa.
    await page.getByRole('link', { name: /gerenciar treinos/i }).first().click()
    await page.getByRole('button', { name: /adicionar exercício/i }).click()
    await page.locator('.checkitem').filter({ hasText: forado }).click()

    await abrirPicker()
    await expect(page.getByText(/já estão nesta sessão/i)).toBeVisible()
    await expect(page.locator('.checkitem').filter({ hasText: forado })).toHaveCount(0)

    // Devolve tudo: apagar o exercício também tira o item do treino.
    await page.getByRole('link', { name: /^exercícios$/i }).first().click()
    await page.getByRole('button', { name: new RegExp(forado, 'i') }).click()
    await page.getByRole('button', { name: /apagar exercício/i }).click()
    await page.getByRole('button', { name: /apagar exercício/i }).click()
    await expect(page.locator('.tile')).toHaveCount(1)
  })

  test('muda o status da sessão', async () => {
    await page.getByRole('link', { name: /histórico de treinos/i }).first().click()
    await page.locator('.calendar__day--concluida').click()

    await page.getByLabel(/^status$/i).selectOption('incompleta')

    await page.getByRole('link', { name: /histórico de treinos/i }).first().click()
    await expect(page.locator('.calendar__day--incompleta')).toHaveCount(1)
    await expect(page.locator('.calendar__day--concluida')).toHaveCount(0)
  })

  test('cria, renomeia, reordena e apaga um treino', async () => {
    await page.getByRole('link', { name: /gerenciar treinos/i }).first().click()
    await expect(page.getByText(/2 treinos no ciclo/i)).toBeVisible()

    // Criar: o ciclo cresce junto, senão a numeração de bloco derivaria.
    await page.getByRole('button', { name: /novo treino/i }).click()
    await expect(page.getByText(/3 treinos no ciclo/i)).toBeVisible()

    // Renomear.
    const name = page.getByLabel(/^nome$/i)
    await name.fill('Treino Z')
    await expect(page.locator('.pill', { hasText: 'Treino Z' })).toBeVisible()

    // Mover para o começo do rodízio.
    await page.getByRole('button', { name: /^subir$/i }).first().click()
    await expect(page.getByText(/posição 2 de 3/i)).toBeVisible()

    // Apagar, com confirmação.
    await page.getByRole('button', { name: /apagar treino/i }).click()
    await page.getByRole('button', { name: /^apagar$/i }).click()
    await expect(page.getByText(/2 treinos no ciclo/i)).toBeVisible()
    await expect(page.locator('.pill', { hasText: 'Treino Z' })).toHaveCount(0)
  })

  test('apagar um treino usado preserva o histórico dele', async () => {
    await page.getByRole('link', { name: /gerenciar treinos/i }).first().click()

    // O treino A é o que tem a sessão registrada, e o aviso diz isso.
    await page.locator('.pill', { hasText: 'Treino A' }).click()
    await page.getByRole('button', { name: /apagar treino/i }).click()
    await expect(page.getByText(/1 sessão registrada/i)).toBeVisible()
    await page.getByRole('button', { name: /^apagar$/i }).click()

    await expect(page.getByText(/1 treino no ciclo/i)).toBeVisible()

    // Soft delete: a sessão continua no calendário, com a letra do treino.
    // Ela está como incompleta desde o teste que mexeu no status.
    await page.getByRole('link', { name: /histórico de treinos/i }).first().click()
    await expect(page.locator('.calendar__day--incompleta')).toHaveCount(1)
    await expect(page.locator('.calendar__day--incompleta')).toContainText('A')
  })

  test('o último treino do ciclo não pode ser apagado', async () => {
    await page.getByRole('link', { name: /gerenciar treinos/i }).first().click()

    await expect(page.getByRole('button', { name: /apagar treino/i })).toBeDisabled()
    await expect(page.getByText(/pelo menos um treino/i)).toBeVisible()
  })

  test('apagar a sessão leva junto as séries e o cardio', async () => {
    await page.getByRole('link', { name: /histórico de treinos/i }).first().click()
    await page.locator('.calendar__day--incompleta').click()
    await page.getByRole('button', { name: /apagar sessão/i }).click()
    // O gatilho some ao confirmar, então o nome pode ser o mesmo — e ser
    // explícito evita colidir com o "Apagar cardio" logo acima.
    await page.getByRole('button', { name: /apagar sessão/i }).click()

    await expect(page.getByText(/nenhuma sessão ainda/i)).toBeVisible()

    // Nada de série órfã: o export não pode mais ter linha nenhuma.
    await page.getByRole('link', { name: /configurações/i }).first().click()
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: /baixar csv/i }).click()
    const file = await download
    const stream = await file.createReadStream()
    const chunks: Buffer[] = []
    for await (const chunk of stream) chunks.push(chunk as Buffer)
    const csv = Buffer.concat(chunks).toString('utf8').trim()
    expect(csv.split('\r\n')).toHaveLength(1)
  })

  test('apagar um exercício tira ele do treino e da biblioteca', async () => {
    await page.getByRole('link', { name: /^exercícios$/i }).first().click()
    await page.locator('.tile').first().click()

    // O aviso conta a consequência antes: o exercício sai dos treinos que o usam.
    await expect(page.getByText(/sai também de|não está em nenhum treino/i)).toBeVisible()

    await page.getByRole('button', { name: /apagar exercício/i }).click()
    await page.getByRole('button', { name: /apagar exercício/i }).click()

    await expect(page.getByText(/nenhum exercício|0 de 0/i).first()).toBeVisible()
  })

  test('tudo o que foi registrado chega ao servidor', async () => {
    // A UI é local-first, então ela mostraria a sessão correta mesmo com a fila
    // travada. Drenar o outbox é o que prova que o servidor recebeu.
    await expect
      .poll(
        () => page.evaluate(async () => {
          const open = indexedDB.open('meu-treino')
          const db = await new Promise<IDBDatabase>((resolve) => {
            open.onsuccess = () => resolve(open.result)
          })
          return new Promise<number>((resolve) => {
            const request = db.transaction('outbox', 'readonly').objectStore('outbox').count()
            request.onsuccess = () => resolve(request.result)
            request.onerror = () => resolve(-1)
          })
        }),
        { timeout: 20_000, message: 'o outbox precisa drenar' },
      )
      .toBe(0)
  })

  test('o percurso inteiro rodou sem erro de runtime', async () => {
    expect(errors, `erros no console: ${errors.join(' | ')}`).toEqual([])
  })
})
