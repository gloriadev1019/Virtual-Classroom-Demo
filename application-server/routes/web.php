<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\ClassroomController;
use App\Http\Controllers\SessionController;

/*
|--------------------------------------------------------------------------
| Web Routes
|--------------------------------------------------------------------------
|
| Here is where you can register web routes for your application. These
| routes are loaded by the RouteServiceProvider and all of them will
| be assigned to the "web" middleware group. Make something great!
|
*/

Route::get('/', function () {
    return view('welcome');
});

// Legacy token route for compatibility
Route::post('/token', [ClassroomController::class, 'generateToken']);

// Routes to serve files via /storage/ paths
Route::get('/storage/converted/{filename}', function ($filename) {
    $path = storage_path('app/public/converted/' . $filename);
    
    if (!file_exists($path)) {
        abort(404, 'File not found');
    }
    
    return response()->file($path, [
        'Content-Type' => 'image/png',
        'Cache-Control' => 'public, max-age=31536000',
        'Access-Control-Allow-Origin' => '*',
    ]);
})->where('filename', '.*');

Route::get('/storage/uploads/{filename}', function ($filename) {
    $path = storage_path('app/public/uploads/' . $filename);
    
    if (!file_exists($path)) {
        abort(404, 'File not found');
    }
    
    $mimeType = mime_content_type($path);
    
    return response()->file($path, [
        'Content-Type' => $mimeType,
        'Cache-Control' => 'public, max-age=31536000',
        'Access-Control-Allow-Origin' => '*',
    ]);
})->where('filename', '.*');


