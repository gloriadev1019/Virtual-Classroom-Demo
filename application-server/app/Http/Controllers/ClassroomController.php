<?php

namespace App\Http\Controllers;

use App\Models\ClassroomSession;
use Agence104\LiveKit\AccessToken;
use Agence104\LiveKit\AccessTokenOptions;
use Agence104\LiveKit\VideoGrant;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Log;

class ClassroomController extends Controller
{
    public function generateToken(Request $request)
    {
        $request->validate([
            'roomName' => 'required|string',
            'participantName' => 'required|string',
        ]);

        $roomName = $request->roomName;
        $participantName = $request->participantName;

        $tokenOptions = (new AccessTokenOptions())
            ->setIdentity($participantName);
        
        $videoGrant = (new VideoGrant())
            ->setRoomJoin()
            ->setRoomName($roomName);
        
        $token = (new AccessToken(
            config('livekit.api_key'),
            config('livekit.api_secret')
        ))
            ->init($tokenOptions)
            ->setGrant($videoGrant)
            ->toJwt();

        return response()->json(['token' => $token]);
    }

    public function uploadFile(Request $request)
    {
        try {
            // Log the request for debugging
            \Log::info('File upload request received', [
                'has_file' => $request->hasFile('file'),
                'all_files' => $request->allFiles(),
                'content_type' => $request->header('Content-Type'),
            ]);

            $request->validate([
                'file' => 'required|file|mimes:pdf,docx,pptx|max:10240', // 10MB max
            ]);

            $file = $request->file('file');
            $filename = time() . '_' . $file->getClientOriginalName();
            
            // Store in uploads directory
            $path = $file->storeAs('uploads', $filename, 'public');
            
            \Log::info('File uploaded successfully', [
                'filename' => $filename,
                'path' => $path,
            ]);
            
            return response()->json([
                'success' => true,
                'filename' => $filename,
                'path' => $path,
            ]);
        } catch (\Illuminate\Validation\ValidationException $e) {
            \Log::error('File upload validation failed', [
                'errors' => $e->errors(),
            ]);
            
            return response()->json([
                'success' => false,
                'error' => 'Validation failed',
                'details' => $e->errors(),
            ], 422);
        } catch (\Exception $e) {
            \Log::error('File upload failed', [
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);
            
            return response()->json([
                'success' => false,
                'error' => 'File upload failed',
                'details' => $e->getMessage(),
            ], 500);
        }
    }

    public function convertFile(Request $request)
    {
        $request->validate([
            'filename' => 'required|string',
        ]);

        $filename = $request->filename;
        $inputPath = storage_path('app/public/uploads/' . $filename);
        $outputDir = storage_path('app/public/converted/');

        // Create output directory if it doesn't exist
        if (!file_exists($outputDir)) {
            mkdir($outputDir, 0755, true);
        }

        // Prepare headless LibreOffice execution with a writable user profile for cloud envs
        $sofficePath = env('SOFFICE_PATH', '/usr/bin/soffice');
        if (!file_exists($sofficePath)) {
            $sofficePath = 'soffice';
        }

        $profileDir = storage_path('app/lo_profile');
        if (!file_exists($profileDir)) {
            mkdir($profileDir, 0700, true);
        }
        $xdgCache = $profileDir . '/xdg-cache';
        $xdgConfig = $profileDir . '/xdg-config';
        $xdgRuntime = $profileDir . '/xdg-runtime';
        $tmpDir = $profileDir . '/tmp';
        foreach ([$xdgCache, $xdgConfig, $xdgRuntime, $tmpDir] as $dir) {
            if (!file_exists($dir)) {
                mkdir($dir, 0700, true);
            }
        }

        // LibreOffice expects a file URI for the user installation directory
        $userInstallUri = 'file://' . str_replace(DIRECTORY_SEPARATOR, '/', $profileDir);

        // Set environment variables to avoid dconf/HOME permission issues in headless servers
        $envPrefix = 'HOME=' . escapeshellarg($profileDir)
            . ' XDG_CACHE_HOME=' . escapeshellarg($xdgCache)
            . ' XDG_CONFIG_HOME=' . escapeshellarg($xdgConfig)
            . ' XDG_RUNTIME_DIR=' . escapeshellarg($xdgRuntime)
            . ' TMPDIR=' . escapeshellarg($tmpDir);

        // Convert using LibreOffice in headless mode
        $command = $envPrefix . ' ' . escapeshellcmd($sofficePath)
            . ' --headless --nologo --nodefault --nofirststartwizard --norestore --nolockcheck'
            . ' -env:UserInstallation=' . $userInstallUri
            . ' --convert-to png --outdir ' . escapeshellarg($outputDir) . ' ' . escapeshellarg($inputPath);
        
        $output = [];
        $returnCode = 0;
        
        exec($command . " 2>&1", $output, $returnCode);

        if ($returnCode !== 0) {
            Log::error('LibreOffice conversion failed', [
                'command' => $command,
                'output' => $output,
                'return_code' => $returnCode
            ]);
            
            return response()->json([
                'success' => false,
                'error' => 'File conversion failed',
                'details' => implode("\n", $output)
            ], 500);
        }

        // Find the converted file
        $convertedFiles = glob($outputDir . pathinfo($filename, PATHINFO_FILENAME) . '*.png');
        
        if (empty($convertedFiles)) {
            return response()->json([
                'success' => false,
                'error' => 'No converted files found'
            ], 500);
        }

        $convertedFile = basename($convertedFiles[0]);
        
        return response()->json([
            'success' => true,
            'converted_file' => $convertedFile,
            'url' => asset('storage/converted/' . $convertedFile),
        ]);
    }
}
