// app.ts — 岩友Beta 入口
App<IAppOption>({
  globalData: {
    // 启动场景参数：岩馆桌贴小程序码（?gymId=xx）、分享卡片路径参数等
    launchQuery: {}
  },
  onLaunch(options) {
    if (options && options.query) {
      this.globalData.launchQuery = options.query
    }
    if (wx.cloud) {
      wx.cloud.init({
        env: 'cloud1-d9gjpqqv42f005e11',
        traceUser: true
      })
    }
    // 启动即同步：分享/桌贴深链不必先经过首页。同步完成后刷新当前页。
    try {
      const cloudSync = require('./utils/cloud-sync')
      const dataSource = require('./utils/data-source')
      cloudSync.ensureInit()
      dataSource.onSync(() => {
        const pages = getCurrentPages() || []
        pages.forEach((p: any) => {
          if (p && typeof p.load === 'function') {
            try { p.load() } catch (e) { /* ignore */ }
          }
        })
      })
    } catch (e) {
      console.warn('[app] cloud boot skipped', e)
    }
  },
  onError(err: string) {
    console.error('[App.onError]', err)
  }
})
