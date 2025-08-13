<?php

namespace App\Http\Controllers;

use App\Models\ClassroomSession;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class SessionController extends Controller
{
    public function store(Request $request)
    {
        $request->validate([
            'subject' => 'required|string|max:255',
            'tutor_name' => 'required|string|max:255',
            'student_name' => 'required|string|max:255',
        ]);

        $session = ClassroomSession::create([
            'subject' => $request->subject,
            'tutor_name' => $request->tutor_name,
            'student_name' => $request->student_name,
        ]);

        // Generate role-based URLs pointing to the React frontend
        $frontendUrl = 'http://192.168.105.3:5080'; // React frontend URL
        $baseUrl = $frontendUrl . '/classroom/' . $session->id;
        
        $urls = [
            'tutor' => $baseUrl . '?role=tutor',
            'student' => $baseUrl . '?role=student',
            'moderator' => $baseUrl . '?role=moderator'
        ];

        return response()->json([
            'success' => true,
            'session' => $session,
            'urls' => $urls,
            'message' => 'Session created successfully!'
        ]);
    }

    public function show($id)
    {
        $session = ClassroomSession::findOrFail($id);
        
        return response()->json([
            'success' => true,
            'session' => $session
        ]);
    }
}
