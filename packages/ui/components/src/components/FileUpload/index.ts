import { el, tones } from '../../factory'
import { FileUploadBase } from '@pyreon/ui-primitives'

const FileUpload = el.config({ name: 'FileUpload', component: FileUploadBase }).theme((t, m) => ({
  borderWidth: t.borderWidth.medium,
  borderStyle: t.borderStyle.dashed,
  borderColor: tones(t, m).border,
  borderRadius: t.borderRadius.medium,
  padding: t.spacing.large,
  backgroundColor: t.color.system.base[50],
  color: tones(t, m).text,
  textAlign: 'center',
  cursor: 'pointer',
  transition: t.transition.fast,
  hover: {
    borderColor: t.color.system.primary.base,
    backgroundColor: t.color.system.primary[50],
  },
}))

export default FileUpload
