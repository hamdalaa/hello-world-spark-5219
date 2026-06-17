import { createServer } from './app'

const port = Number(process.env.PORT ?? 3000)
const host = process.env.HOST ?? '0.0.0.0'

createServer().listen(port, host, () => {
  console.log(`Xtream Web Player API listening on http://${host}:${port}`)
})
