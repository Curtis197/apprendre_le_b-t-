import type { Metadata } from 'next'
import { ProfileCourses } from '@/components/courses/ProfileCourses'

export const metadata: Metadata = {
  title: 'Mon profil',
  robots: { index: false, follow: false },
}

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <ProfileCourses />
    </>
  )
}
