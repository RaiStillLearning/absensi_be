# Authentication Endpoints

> [!NOTE]
> Endpoints autentikasi universal untuk seluruh pengguna sistem: Admin, Guru Mata Pelajaran, Wali Kelas, dan Siswa.

## Tag: `Authentication`

### 1. Unified User Login
- **Method**: `POST`
- **Path**: `/api/v1/auth/login`
- **Request Body**:
  ```json
  {
    "nisn_atau_username": "admin",
    "kata_sandi": "admin123"
  }
  ```
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "message": "Login berhasil",
    "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "1",
      "username": "admin",
      "role": "admin",
      "peran": "Administrator",
      "nama_lengkap": "Admin",
      "email": "admin@sekolah.example"
    }
  }
  ```

### 2. Teacher Direct Login
- **Method**: `POST`
- **Path**: `/api/v1/auth/guru/login`
- **Request Body**:
  ```json
  {
    "nip": "198905122015012008",
    "password": "guru123"
  }
  ```

### 3. Student Direct Login
- **Method**: `POST`
- **Path**: `/api/v1/auth/siswa/login`
- **Request Body**:
  ```json
  {
    "nisn": "0102641001",
    "password": "siswa123"
  }
  ```

### 4. Authenticated User Profile
- **Method**: `GET`
- **Path**: `/api/v1/auth/me`
- **Header**: `Authorization: Bearer <token>`
