import { useState } from 'react'
import LoginForm from '../components/auth/LoginForm'
import RegisterForm from '../components/auth/RegisterForm'

export default function Login() {
  const [isRegister, setIsRegister] = useState(false)
  const [registeredUser, setRegisteredUser] = useState('')
  const [notice, setNotice] = useState('')

  const switchMode = () => {
    setNotice('')
    setIsRegister((prev) => !prev)
  }

  const handleRegistered = (user, message) => {
    setRegisteredUser(user)
    setNotice(message)
    setIsRegister(false)
  }

  return (
    <main className="mx-auto mt-[100px] flex max-w-[300px] flex-col gap-2.5 px-4 box-content">
      <h1 className="mb-2.5 text-[32px] leading-[1.2]">{isRegister ? 'Create account' : 'Login'}</h1>
      {isRegister
        ? <RegisterForm onRegistered={handleRegistered} onSwitch={switchMode} />
        : <LoginForm key={registeredUser} initialUser={registeredUser} onSwitch={switchMode} />}
      {notice && <p role="status" className="text-success">{notice}</p>}
    </main>
  )
}
