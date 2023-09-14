module.exports = [{
  type: 'list',
  message: '请选择要创建的模板',
  name: 'projectSelect',
  default: 0,
  choices: [
    { value: 0, name: 'react 基础模板' },
    { value: 1, name: 'vue 基础模板' },
  ]
}];
