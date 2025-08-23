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

        // Check if input file exists
        if (!file_exists($inputPath)) {
            return response()->json([
                'success' => false,
                'error' => 'Input file not found'
            ], 404);
        }

        // Check if it's a PDF and if it's encrypted
        $fileExtension = strtolower(pathinfo($filename, PATHINFO_EXTENSION));
        if ($fileExtension === 'pdf') {
            $pdfInfo = $this->checkPdfEncryption($inputPath);
            if ($pdfInfo['encrypted']) {
                return response()->json([
                    'success' => false,
                    'error' => 'PDF is encrypted and cannot be converted',
                    'details' => 'Please provide an unencrypted PDF file or remove the password protection.',
                    'encrypted' => true
                ], 400);
            }
        }

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
            
            // Check if the error is related to encryption
            $errorOutput = implode("\n", $output);
            if (stripos($errorOutput, 'encrypted') !== false || stripos($errorOutput, 'password') !== false) {
                return response()->json([
                    'success' => false,
                    'error' => 'PDF is encrypted and cannot be converted',
                    'details' => 'Please provide an unencrypted PDF file or remove the password protection.',
                    'encrypted' => true
                ], 400);
            }
            
            return response()->json([
                'success' => false,
                'error' => 'File conversion failed',
                'details' => $errorOutput
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
        
        // Generate URL using the storage path
        $baseUrl = config('app.url');
        if (str_ends_with($baseUrl, '/')) {
            $baseUrl = rtrim($baseUrl, '/');
        }
        $fileUrl = $baseUrl . '/storage/converted/' . $convertedFile;
        
        return response()->json([
            'success' => true,
            'converted_file' => $convertedFile,
            'url' => $fileUrl,
        ]);
    }

    /**
     * Check if a PDF file is encrypted
     */
    private function checkPdfEncryption($filePath)
    {
        try {
            $content = file_get_contents($filePath);
            
            // Check for encryption dictionary in PDF
            if (preg_match('/\/Encrypt\s+\d+\s+\d+\s+R/', $content)) {
                return ['encrypted' => true, 'reason' => 'PDF contains encryption dictionary'];
            }
            
            // Check for password protection indicators
            if (preg_match('/\/Filter\s*\/Standard/', $content) && preg_match('/\/V\s*[1-5]/', $content)) {
                return ['encrypted' => true, 'reason' => 'PDF uses standard encryption'];
            }
            
            // Additional check for common encryption patterns
            if (preg_match('/\/Encrypt\s+\d+\s+\d+\s+R.*\/Filter\s*\/Standard/', $content)) {
                return ['encrypted' => true, 'reason' => 'PDF uses standard encryption with dictionary'];
            }
            
            return ['encrypted' => false, 'reason' => 'PDF appears to be unencrypted'];
            
        } catch (\Exception $e) {
            Log::error('Error checking PDF encryption', [
                'file' => $filePath,
                'error' => $e->getMessage()
            ]);
            
            return ['encrypted' => false, 'reason' => 'Could not determine encryption status'];
        }
    }
}
