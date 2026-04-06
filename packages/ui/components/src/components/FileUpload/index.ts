import rocketstyle from '@pyreon/rocketstyle'
import { FileUploadBase } from '@pyreon/ui-primitives'
import { getComponentTheme } from '@pyreon/ui-theme'
import { fileUploadTheme } from './theme'

const resolved = getComponentTheme(fileUploadTheme)

const FileUpload = rocketstyle({ useBooleans: true })({ name: 'FileUpload', component: FileUploadBase as any })
  .theme(resolved.base)

export default FileUpload
