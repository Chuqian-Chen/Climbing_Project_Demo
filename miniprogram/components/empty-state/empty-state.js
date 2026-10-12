// 空状态占位
Component({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    icon: { type: String, value: '' },
    title: { type: String, value: '这里还空着' },
    desc: { type: String, value: '' },
    btnText: { type: String, value: '' }
  },
  methods: {
    onBtn() {
      this.triggerEvent('action');
    }
  }
});
