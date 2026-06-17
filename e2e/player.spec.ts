import { expect, test, type Page } from '@playwright/test'

async function mockSuccessfulLogin(page: Page) {
  await page.route('**/api/auth/login', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        userInfo: {
          auth: 1,
          username: 'demo-user',
          status: 'Active',
        },
        serverInfo: {},
      }),
    })
  })

  await page.route('**/api/xtream/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '[]',
    })
  })
}

async function mockCatalogLogin(page: Page) {
  await page.route('**/api/auth/login', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        userInfo: {
          auth: 1,
          username: 'demo-user',
          status: 'Active',
          exp_date: '1783641600',
        },
        serverInfo: {},
      }),
    })
  })

  await page.route('**/api/xtream/categories?**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        Array.from({ length: 80 }, (_, index) => ({
          category_id: String(index + 1),
          category_name: `Category ${index + 1}`,
        })),
      ),
    })
  })

  await page.route('**/api/xtream/streams?**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        Array.from({ length: 220 }, (_, index) => ({
          stream_id: index + 1,
          name: `Channel ${index + 1}`,
          category_id: '1',
        })),
      ),
    })
  })
}

test('renders the clean Xtream login experience over HTTP', async ({ page }) => {
  await page.goto('/')

  await expect(page).toHaveURL(/^http:\/\/127\.0\.0\.1:5173/)
  await expect(page.getByRole('heading', { name: /xtream web player/i })).toBeVisible()
  await expect(page.getByLabel(/server url/i)).toBeVisible()
  await expect(page.getByLabel(/username/i)).toBeVisible()
  await expect(page.getByLabel(/password/i)).toBeVisible()
  await expect(page.getByLabel(/remember me/i)).not.toBeChecked()
  await expect(page.getByRole('button', { name: /connect/i })).toBeVisible()
  await expect(page.getByText(/legal iptv subscription/i)).toBeVisible()
  await expect(page.getByText(/connect to your xtream subscription/i)).toHaveCount(0)

  const logoBox = await page.locator('.login-panel .brand-mark').boundingBox()
  const titleBox = await page.getByRole('heading', { name: /xtream web player/i }).boundingBox()

  expect(logoBox).not.toBeNull()
  expect(titleBox).not.toBeNull()
  expect(titleBox!.x).toBeGreaterThan(logoBox!.x + logoBox!.width)
  expect(titleBox!.y).toBeLessThan(logoBox!.y + logoBox!.height)
})

test('remembers server URL and username only when remember me is checked', async ({ page }) => {
  await mockSuccessfulLogin(page)
  await page.goto('/')

  await page.getByLabel(/server url/i).fill('http://cool-panel.test:8080')
  await page.getByLabel(/username/i).fill('demo-user')
  await page.getByLabel(/password/i).fill('super-secret')
  await page.getByLabel(/remember me/i).check()
  await page.getByRole('button', { name: /connect/i }).click()

  await expect.poll(async () => page.evaluate(() => localStorage.getItem('xtream.rememberedLogin'))).not.toBeNull()

  const rememberedLogin = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('xtream.rememberedLogin') ?? '{}'),
  )

  expect(rememberedLogin).toEqual({
    serverUrl: 'http://cool-panel.test:8080',
    username: 'demo-user',
  })
  expect(JSON.stringify(rememberedLogin)).not.toContain('super-secret')
})

test('clears remembered login when remember me is unchecked', async ({ page }) => {
  await mockSuccessfulLogin(page)
  await page.addInitScript(() => {
    localStorage.setItem(
      'xtream.rememberedLogin',
      JSON.stringify({ serverUrl: 'http://old-panel.test', username: 'old-user' }),
    )
  })

  await page.goto('/')

  await expect(page.getByLabel(/server url/i)).toHaveValue('http://old-panel.test')
  await expect(page.getByLabel(/username/i)).toHaveValue('old-user')

  await page.getByLabel(/server url/i).fill('http://new-panel.test')
  await page.getByLabel(/username/i).fill('new-user')
  await page.getByLabel(/password/i).fill('secret')
  await page.getByLabel(/remember me/i).uncheck()
  await page.getByRole('button', { name: /connect/i }).click()

  await expect.poll(async () => page.evaluate(() => localStorage.getItem('xtream.rememberedLogin'))).toBeNull()
})

test('keeps the page fixed while categories and channels scroll internally', async ({ page }) => {
  await mockCatalogLogin(page)
  await page.goto('/')

  await page.getByLabel(/server url/i).fill('http://cool-panel.test:8080')
  await page.getByLabel(/username/i).fill('demo-user')
  await page.getByLabel(/password/i).fill('super-secret')
  await page.getByRole('button', { name: /connect/i }).click()
  await expect(page.locator('.app-shell')).toBeVisible()
  await expect(page.getByRole('button', { name: /^Channel 1 Live channel$/ })).toBeVisible()

  const pageMetrics = await page.evaluate(() => {
    const browserGlobal = globalThis as unknown as {
      document: {
        body: { clientHeight: number; scrollHeight: number }
        documentElement: { clientHeight: number; scrollHeight: number }
      }
      getComputedStyle: (element: unknown) => { overflowY: string }
    }

    return {
      bodyClientHeight: browserGlobal.document.body.clientHeight,
      bodyScrollHeight: browserGlobal.document.body.scrollHeight,
      documentClientHeight: browserGlobal.document.documentElement.clientHeight,
      documentScrollHeight: browserGlobal.document.documentElement.scrollHeight,
      overflowY: browserGlobal.getComputedStyle(browserGlobal.document.body).overflowY,
    }
  })

  expect(pageMetrics.overflowY).toBe('hidden')
  expect(pageMetrics.bodyScrollHeight).toBeLessThanOrEqual(pageMetrics.bodyClientHeight)
  expect(pageMetrics.documentScrollHeight).toBeLessThanOrEqual(pageMetrics.documentClientHeight)

  await page.evaluate(() => {
    ;(globalThis as unknown as { scrollTo: (x: number, y: number) => void }).scrollTo(0, 600)
  })
  await expect
    .poll(async () => page.evaluate(() => (globalThis as unknown as { scrollY: number }).scrollY))
    .toBe(0)

  for (const selector of ['.category-rail', '.virtual-list']) {
    await expect
      .poll(async () =>
        page.locator(selector).evaluate((element) => ({
          clientHeight: element.clientHeight,
          scrollHeight: element.scrollHeight,
        })),
      )
      .toMatchObject({
        clientHeight: expect.any(Number),
        scrollHeight: expect.any(Number),
      })

    const scrollResult = await page.locator(selector).evaluate((element) => {
      const browserGlobal = globalThis as unknown as {
        getComputedStyle: (element: unknown) => { scrollbarWidth: string }
      }

      element.scrollTop = 600
      return {
        canScroll: element.scrollHeight > element.clientHeight,
        scrollbarWidth: browserGlobal.getComputedStyle(element).scrollbarWidth,
        scrollTop: element.scrollTop,
      }
    })

    expect(scrollResult.canScroll).toBe(true)
    expect(scrollResult.scrollbarWidth).toBe('none')
    expect(scrollResult.scrollTop).toBeGreaterThan(0)
  }
})

test('organizes the authenticated workspace into a browse header and watch sidebar', async ({ page }) => {
  await mockCatalogLogin(page)
  await page.goto('/')

  await page.getByLabel(/server url/i).fill('http://cool-panel.test:8080')
  await page.getByLabel(/username/i).fill('demo-user')
  await page.getByLabel(/password/i).fill('super-secret')
  await page.getByRole('button', { name: /connect/i }).click()

  await expect(page.locator('.browse-header')).toBeVisible()
  await expect(page.locator('.browse-header').getByRole('button', { name: /live/i })).toBeVisible()
  await expect(page.locator('.stats-row')).toBeVisible()
  await expect(page.locator('.right-column')).toBeVisible()
})

test('shows categories even when stream loading is delayed', async ({ page }) => {
  await page.route('**/api/auth/login', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        userInfo: {
          auth: 1,
          username: 'demo-user',
          status: 'Active',
          exp_date: '1783641600',
        },
        serverInfo: {},
      }),
    })
  })

  await page.route('**/api/xtream/categories?**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ category_id: '1', category_name: 'Sports' }]),
    })
  })

  await page.route('**/api/xtream/streams?**', async () => {
    await new Promise(() => undefined)
  })

  await page.goto('/')
  await page.getByLabel(/server url/i).fill('http://cool-panel.test:8080')
  await page.getByLabel(/username/i).fill('demo-user')
  await page.getByLabel(/password/i).fill('super-secret')
  await page.getByRole('button', { name: /connect/i }).click()

  await expect(page.getByRole('button', { name: /sports/i })).toBeVisible()
  await expect(page.getByText(/loading content/i)).toBeVisible()
})
