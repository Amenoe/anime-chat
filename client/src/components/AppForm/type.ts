type IFormType = 'input' | 'password' | 'select' | 'datepicker' | 'text'

export interface IFormItem {
  field: string
  type: IFormType
  label: string
  rules?: any[]
  placeholder?: string
  //针对select
  options?: any[]
  //针对特殊的属性
  otherOptions?: object
  //是否在表单中显示这个属性
  isHidden?: boolean
}
