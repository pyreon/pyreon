import { FileUploadBase } from '@pyreon/ui-primitives'
import { createComponent } from '../../factory'
import { fileUploadTheme } from './theme'

const FileUpload = createComponent('FileUpload', FileUploadBase, fileUploadTheme)
export default FileUpload
