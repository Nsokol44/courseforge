import UploadWizard from '@/components/course/UploadWizard'

export default function NewCoursePage() {
  return (
    <div>
      <div className="cf-topbar">
        <span className="cf-serif" style={{ fontSize: 19, fontWeight: 300 }}>Add Course</span>
      </div>
      <div className="cf-content" style={{ maxWidth: 680 }}>
        <UploadWizard />
      </div>
    </div>
  )
}
