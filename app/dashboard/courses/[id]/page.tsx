import { notFound } from 'next/navigation'
import { createServerClient } from '@/lib/supabase-server'
import CourseView from '@/components/course/CourseView'

interface Props {
  params: { id: string }
}

export default async function CoursePage({ params }: Props) {
  const supabase = createServerClient()

  const { data: course, error } = await supabase
    .from('courses')
    .select(`
      *,
      weeks(*),
      assignments(*),
      python_activities(*),
      realworld_items(*),
      course_files(id, filename, file_type, extracted_text, created_at)
    `)
    .eq('id', params.id)
    .single()

  if (error || !course) notFound()

  // Sort weeks by week_number
  if (course.weeks) {
    course.weeks.sort((a: any, b: any) => a.week_number - b.week_number)
  }
  if (course.assignments) {
    course.assignments.sort((a: any, b: any) => a.sort_order - b.sort_order)
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, institution, department')
    .single()

  return <CourseView course={course} profile={profile} />
}
