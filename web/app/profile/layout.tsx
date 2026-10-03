import type { Metadata } from 'next'
import Link from 'next/link'
import { ProfileCourses } from '@/components/courses/ProfileCourses'
import { ProfileCorrections } from '@/components/ProfileCorrections'

export const metadata: Metadata = {
  title: 'Mon profil',
  robots: { index: false, follow: false },
}

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <ProfileCorrections />
      <ProfileCourses />
      <div className="mx-auto max-w-3xl px-4 pb-12">
        <Link className="text-sm underline" href="/notifications">Gérer mes notifications par e-mail</Link>
      </div>
    </>
  )
}
