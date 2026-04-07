import rocketstyle from '@pyreon/rocketstyle'
import { FileUploadBase } from '@pyreon/ui-primitives'

const rs = rocketstyle({ useBooleans: true })

const FileUpload = rs({ name: 'FileUpload', component: FileUploadBase })
  .theme((t: any) => ({
    borderWidth: t.borderWidth.medium,
    borderStyle: t.borderStyle.dashed,
    borderColor: t.color.system.base[300],
    borderRadius: t.borderRadius.medium,
    padding: t.spacing.large,
    backgroundColor: t.color.system.base[50],
    textAlign: 'center',
    cursor: 'pointer',
    transition: t.transition.fast,
    hover: {
      borderColor: t.color.system.primary.base,
      backgroundColor: t.color.system.primary[50],
    },
  }))

export default FileUpload
