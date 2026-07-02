export interface RunnerEnv {
  ownerEmail: string;
  ownerPassword: string;
  memberEmail: string;
  memberPassword: string;
  otherMemberEmail: string;
  nonMemberEmail: string;
  readerClubId: string;
  standardClubId: string;
  otherClubId: string;
  targetMemberName: string;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Не задана переменная окружения ${name}. Заполните .tmp/ui-test-runner/.env`);
  }
  return value;
}

export function getRunnerEnv(): RunnerEnv {
  return {
    ownerEmail: required('VOXLIBRIS_OWNER_EMAIL'),
    ownerPassword: required('VOXLIBRIS_OWNER_PASSWORD'),
    memberEmail: required('VOXLIBRIS_MEMBER_EMAIL'),
    memberPassword: required('VOXLIBRIS_MEMBER_PASSWORD'),
    otherMemberEmail: required('VOXLIBRIS_OTHER_MEMBER_EMAIL'),
    nonMemberEmail: required('VOXLIBRIS_NON_MEMBER_EMAIL'),
    readerClubId: required('VOXLIBRIS_READER_CLUB_ID'),
    standardClubId: required('VOXLIBRIS_STANDARD_CLUB_ID'),
    otherClubId: required('VOXLIBRIS_OTHER_CLUB_ID'),
    targetMemberName: required('VOXLIBRIS_TARGET_MEMBER_NAME'),
  };
}
