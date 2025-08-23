<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\ClassroomController;
use App\Http\Controllers\SessionController;

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
|
| Here is where you can register API routes for your application. These
| routes are loaded by the RouteServiceProvider and all of them will
| be assigned to the "api" middleware group. Make something great!
|
*/

// Session management
Route::post('/sessions', [SessionController::class, 'store']);
Route::get('/sessions/{id}', [SessionController::class, 'show']);

// Token generation
Route::post('/token', [ClassroomController::class, 'generateToken']);

// File management
Route::post('/upload-file', [ClassroomController::class, 'uploadFile']);
Route::post('/convert-file', [ClassroomController::class, 'convertFile']);

// Test route
Route::post('/test-upload', function (Request $request) {
    return response()->json([
        'success' => true,
        'message' => 'Test upload endpoint working',
        'has_file' => $request->hasFile('file'),
        'content_type' => $request->header('Content-Type'),
    ]);
});


