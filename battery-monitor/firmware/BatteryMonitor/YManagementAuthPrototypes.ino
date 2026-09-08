// Arduino's sketch preprocessor can emit prototypes for functions in later
// .ino tabs before it has seen custom struct declarations. Keep explicit
// forward declarations in an earlier tab so it does not synthesize invalid
// MgmtSession/MgmtChallenge prototypes ahead of their types.
struct MgmtChallenge;
struct MgmtSession;

static MgmtSession* findManagementSession();
static MgmtChallenge* allocateManagementChallenge();
static MgmtSession* allocateManagementSession();
static bool derivePasswordWrapKey(MgmtSession* session, uint8_t out[32]);
