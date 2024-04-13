import { ReactNode } from 'react'

interface PropProps {
  label: string
  children: ReactNode
}

interface PropListProps {
  children: ReactNode | ReactNode[]
}

export const Prop = ({ label, children }: PropProps) => {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-label">{label}</div>
      {children}
    </div>
  )
}

export const PropList = ({ children }: PropListProps) => {
  return <div className="text-body1 flex flex-col gap-6">{children}</div>
}
