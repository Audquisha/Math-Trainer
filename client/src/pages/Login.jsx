import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'

const emptyForm = { user: '', pwd: '', firstName: '', lastName: '', role: '' }

export default function Login() {
  const [isRegister, setIsRegister] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const emptyErrors = {
  register: {
    fname: "",
    lname: "",
    role: "",
    username: "",
    password: "",
    general: "",
  },
  login: {
    username: "",
    password: "",
    general: "",
  },
};
  const [errors, setErrors] = useState(emptyErrors)


  const [success, setSuccess] = useState('')
  const navigate = useNavigate()

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value })

  const toggleMode = () => {
    setIsRegister(!isRegister)
    setErrors(emptyErrors)
    setSuccess('')
  }

  const register = async () => {

  
    

    try {
    {
      if(form.firstName == ''){
         setErrors((prev) => ({
          ...prev,
          register:{
            ...prev.register,
            fname: 'First Name is Required!',

          }
        }))
        return;
      }
      else{
         setErrors((prev) => ({
          ...prev,
          register:{
            ...prev.register,
            fname: '',

          }
        }))


      }

      if(form.lastName == ''){
         setErrors((prev) => ({
          ...prev,
          register:{
            ...prev.register,
            lname: 'Last Name is Required!',

          }
        }))
        return;
      }
      else{
         setErrors((prev) => ({
          ...prev,
          register:{
            ...prev.register,
            lname: '',

          }
        }))
      }
      if(form.role == ''){
         setErrors((prev) => ({
          ...prev,
          register:{
            ...prev.register,
            role: 'Role is Required!',

          }
        }))
        return;
      }
      else{
         setErrors((prev) => ({
          ...prev,
          register:{
            ...prev.register,
            role: '',

          }
        }))
      }
      if(form.user == ''){
         setErrors((prev) => ({
          ...prev,
          register:{
            ...prev.register,
            username: 'Username is Required!',

          }
        }))
        return;
      }
      else{
         setErrors((prev) => ({
          ...prev,
          register:{
            ...prev.register,
            username: '',

          }
        }))
      }
      if(form.pwd == ''){
         setErrors((prev) => ({
          ...prev,
          register:{
            ...prev.register,
            password: 'Password is Required!',

          }
        }))
        return;
      }
      else{
         setErrors((prev) => ({
          ...prev,
          register:{
            ...prev.register,
            password: '',

          }
        }))
      }
    }
      const { data } = await axios.post('/api/auth/register', form)
      setForm({ ...emptyForm, user: form.user })
      setIsRegister(false)
      setSuccess(data.success || 'Account created. Please log in.')
    } catch (err) {
      if (err.response?.status === 409){ 


        setErrors((prev) => ({
          ...prev,
          register:{
            ...prev.register,
            username: 'Username Already Taken!',

          }
        }))
      }
      else{
        //setError(err.response?.data?.message || 'Something went wrong')
        setErrors((prev) => ({
          ...prev,
          register:{
            ...prev.register,
            general: (err.response?.data?.message || 'Something went wrong'),

          }
        }))

    }

      } 
  }

  const login = async () => {
    try {
      {
      if(form.user == ''){
         setErrors((prev) => ({
          ...prev,
          login:{
            ...prev.login,
            username: 'Username is Required!',

          }
        }))
        return;
      }
      else{
         setErrors((prev) => ({
          ...prev,
          login:{
            ...prev.login,
            username: '',

          }
        }))
      }
      if(form.pwd == ''){
         setErrors((prev) => ({
          ...prev,
          login:{
            ...prev.login,
            password: 'Password is Required!',

          }
        }))
        return;
      }
      else{
         setErrors((prev) => ({
          ...prev,
          login:{
            ...prev.login,
            password: '',

          }
        }))
      }
    }
      const { data } = await axios.post('/api/auth/login', { user: form.user, pwd: form.pwd })
      sessionStorage.setItem('accessToken', data.accessToken)
      navigate('/home')
    } catch (err) {
      if (err.response?.status === 404){
        setErrors((prev) => ({
          ...prev,
          login:{
            ...prev.login,
            general: 'Login is not Available Yet!',

          }
        }))
      }
      else{ 
        setErrors((prev) => ({
          ...prev,
          login:{
            ...prev.login,
            general: (err.response?.data?.message || 'Invalid username or password'),

          }
        }))
      }
    }
  }

  const submit = () => {
    setErrors(emptyErrors)
    setSuccess('')
    isRegister ? register() : login()
  }

  return (
    <div style={{ maxWidth: 300, margin: '100px auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h1 style={{ fontSize: 32, lineHeight: 1.2, margin: '0 0 10px' }}>{isRegister ? 'Create account' : 'Login'}</h1>
      {isRegister && (
        <>
          <input placeholder="First name" value={form.firstName} onChange={update('firstName')} style={{border: errors.register.fname ? '1px solid red' : '1px solid #ccc'}}  />
          {errors.register.fname && <p style={{ color: 'red' }}>{errors.register.fname}</p>}

          <input placeholder="Last name" value={form.lastName} onChange={update('lastName')} style={{border: errors.register.lname ? '1px solid red' : '1px solid #ccc'}}/>
          {errors.register.lname && <p style={{ color: 'red' }}>{errors.register.lname}</p>}

          <input placeholder="Role" value={form.role} onChange={update('role')} style={{border: errors.register.role ? '1px solid red' : '1px solid #ccc'}}/>
          {errors.register.role && <p style={{ color: 'red' }}>{errors.register.role}</p>}

          <input placeholder="Username" value={form.user} onChange={update('user')} style={{border: errors.register.username ? '1px solid red' : '1px solid #ccc'}}/>
          {errors.register.username && <p style={{ color: 'red' }}>{errors.register.username}</p>}

          <input type="password" placeholder="Password" value={form.pwd} onChange={update('pwd')}style={{border: errors.register.password ? '1px solid red' : '1px solid #ccc'}} />
          {errors.register.password && <p style={{ color: 'red' }}>{errors.register.password}</p>}
          
          {errors.register.general && <p style={{ color: 'red' }}>{errors.register.general}</p>}

        </>
      )}
      {!isRegister && (
        <>
        <input placeholder="Username" value={form.user} onChange={update('user')} style={{border: (errors.login.username || errors.login.general)? '1px solid red' : '1px solid #ccc'}} />
        {errors.login.username && <p style={{ color: 'red' }}>{errors.login.username}</p>}

        <input type="password" placeholder="Password" value={form.pwd} onChange={update('pwd')} style={{border: (errors.login.password || errors.login.general) ? '1px solid red' : '1px solid #ccc'}}/>
        {errors.login.password && <p style={{ color: 'red' }}>{errors.login.password}</p>}

        {errors.login.general && <p style={{ color: 'red' }}>{errors.login.general}</p>}


        </>

      )}
   
      <button onClick={submit}>{isRegister ? 'Register' : 'Log in'}</button>
      <button onClick={toggleMode}>{isRegister ? 'Back to login' : 'Create an account'}</button>
      {success && <p style={{ color: 'green' }}>{success}</p>}
      
    </div>
  )
}
