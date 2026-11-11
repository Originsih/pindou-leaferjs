export const qrcodeApi = {
  // 生成小程序码并获取临时展示链接
  async generate(scene) {
    // 1. 调用云函数生成小程序码 
    const res = await wx.cloud.callFunction({
      name: 'getQrCode',
      data: {
        scene: scene || 'default',
        page: 'pages/drawing/index' 
      }
    })

    if (!res.result.success) {
      throw new Error(res.result.error || '生成失败')
    }

    // 2. 把 fileID 换成可以直接在 <image> 标签里渲染的临时链接
    const tempRes = await wx.cloud.getTempFileURL({
      fileList: [res.result.fileID]
    })
    
    return tempRes.fileList[0].tempFileURL
  }
}